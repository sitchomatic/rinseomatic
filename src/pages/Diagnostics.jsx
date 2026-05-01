import React, { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Download, AlertTriangle, ShieldAlert, Wrench, RefreshCw, Loader2, Info, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { classifyError } from "@/lib/errorClass";
import { useNavigate } from "react-router-dom";

export default function Diagnostics() {
  const navigate = useNavigate();
  const [selectedProxyMap, setSelectedProxyMap] = useState({});

  // Fetch recent failed/errored test results
  const { data: failedResults = [], isLoading: loadingResults } = useQuery({
    queryKey: ["failed-results"],
    queryFn: async () => {
      // Get both failed and error statuses
      const [failed, errored] = await Promise.all([
        base44.entities.TestResult.filter({ status: "failed" }, "-tested_at", 1000),
        base44.entities.TestResult.filter({ status: "error" }, "-tested_at", 1000)
      ]);
      return [...failed, ...errored].sort((a, b) => new Date(b.tested_at || b.created_date) - new Date(a.tested_at || a.created_date));
    },
    staleTime: 30000,
  });

  const { data: proxies = [] } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => base44.entities.Proxy.list("-created_date", 100),
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["action-logs-export"],
    queryFn: () => base44.entities.ActionLog.list("-timestamp", 5000),
    enabled: false, // only fetch on demand or we can just fetch when exporting
  });

  // Group failures by site and error class/message
  const issues = useMemo(() => {
    const groups = {};
    for (const r of failedResults) {
      if (!r.error_message) continue;
      const cls = classifyError(r.error_message);
      
      // Create a unique key for grouping
      // For config/blocked errors, we can group by the error kind and site
      const key = `${r.site_key}::${cls.kind}::${cls.label}`;
      
      if (!groups[key]) {
        groups[key] = {
          site_key: r.site_key,
          errorClass: cls,
          sampleMessage: r.error_message,
          credentials: new Set(),
          count: 0,
          latest: r.tested_at || r.created_date
        };
      }
      groups[key].count++;
      groups[key].credentials.add(r.credential_id);
      if (new Date(r.tested_at || r.created_date) > new Date(groups[key].latest)) {
        groups[key].latest = r.tested_at || r.created_date;
      }
    }
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [failedResults]);

  const launchRetryMut = useMutation({
    mutationFn: async ({ issue, proxyId }) => {
      const credIds = Array.from(issue.credentials);
      if (credIds.length === 0) throw new Error("No credentials to retry");

      const run = await base44.entities.TestRun.create({
        label: `Retry ${issue.site_key} (${issue.errorClass.label})`,
        site_key: issue.site_key,
        status: "queued",
        concurrency: 2,
        max_retries: 1,
        proxy_mode: proxyId ? "external" : undefined,
        external_proxy_id: proxyId || undefined,
        total_count: credIds.length,
        pending_count: credIds.length,
      });

      const ROW_CHUNK = 100;
      const rows = credIds.map((cid) => ({
        run_id: run.id,
        credential_id: cid,
        site_key: issue.site_key,
        status: "queued",
        attempts: 0,
        elapsed_ms: 0,
      }));

      for (let i = 0; i < rows.length; i += ROW_CHUNK) {
        await base44.entities.TestResult.bulkCreate(rows.slice(i, i + ROW_CHUNK));
      }

      base44.functions.invoke("runWorker", { run_id: run.id }).catch(() => {});
      return run;
    },
    onSuccess: (run) => {
      toast.success(`Retry run launched with ${run.total_count} credentials`);
      navigate(`/runs/${run.id}`);
    },
    onError: (e) => toast.error(e?.message || "Failed to launch retry")
  });

  const exportLogs = async (format) => {
    toast.loading(`Gathering logs for ${format.toUpperCase()} export...`);
    try {
      const [allResults, allLogs] = await Promise.all([
        base44.entities.TestResult.list("-created_date", 10000),
        base44.entities.ActionLog.list("-timestamp", 10000)
      ]);
      
      let blob;
      let filename;

      if (format === 'json') {
        const combined = {
          exported_at: new Date().toISOString(),
          test_results: allResults,
          action_logs: allLogs
        };
        blob = new Blob([JSON.stringify(combined, null, 2)], { type: "application/json" });
        filename = `diagnostics-export-${new Date().toISOString().split('T')[0]}.json`;
      } else {
        // CSV Export for Test Results (the most useful operational metric)
        const headers = ["Run ID", "Site", "Username", "Status", "Attempts", "Elapsed MS", "Tested At", "Error Message"];
        const rows = allResults.map(r => [
          r.run_id, r.site_key, r.username, r.status, r.attempts || 0, r.elapsed_ms || 0, r.tested_at || r.created_date, 
          (r.error_message || "").replace(/"/g, '""').replace(/\n/g, ' ')
        ]);
        
        const csvContent = [
          headers.join(","),
          ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(","))
        ].join("\n");

        blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        filename = `diagnostics-results-${new Date().toISOString().split('T')[0]}.csv`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Logs exported successfully as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(`Failed to export logs: ${err.message}`);
    }
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Analysis"
        title="Diagnostics & Self-Healing"
        description="Comprehensive error analysis, automatic pattern detection, and intelligent recovery suggestions."
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => exportLogs('csv')}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => exportLogs('json')}>
              <Download className="h-4 w-4" /> Export JSON
            </Button>
          </>
        }
      />

      {loadingResults ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : issues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 flex flex-col items-center text-center">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          </div>
          <h3 className="text-lg font-medium">System Healthy</h3>
          <p className="text-muted-foreground text-sm max-w-md mt-2">
            No recent failure patterns detected. The system is operating normally.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {issues.map((issue, idx) => {
            const isBlocked = issue.errorClass.kind === 'blocked';
            const isConfig = issue.errorClass.kind === 'config';
            const isTransient = issue.errorClass.kind === 'transient';
            
            return (
              <Card key={idx} className="bg-card border-border flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] bg-secondary/50">
                        {issue.site_key}
                      </Badge>
                      <Badge className={
                        isBlocked ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" :
                        isConfig ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30" :
                        "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                      }>
                        {issue.errorClass.label}
                      </Badge>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground bg-secondary/30 px-2 py-1 rounded">
                      {issue.count} affected
                    </div>
                  </div>
                  <CardTitle className="text-base mt-3 flex items-center gap-2">
                    {isBlocked && <ShieldAlert className="h-4 w-4 text-amber-500" />}
                    {isConfig && <Wrench className="h-4 w-4 text-rose-500" />}
                    {isTransient && <Activity className="h-4 w-4 text-blue-500" />}
                    {isBlocked ? "Security Block Detected" : isConfig ? "Configuration Issue" : "Network Instability"}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1 line-clamp-2" title={issue.sampleMessage}>
                    {issue.sampleMessage}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="py-2 flex-1">
                  <div className="bg-background/50 rounded-md p-3 border border-border/50">
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Info className="h-3 w-3" /> Remediation Suggestion
                    </div>
                    <p className="text-xs">
                      {isBlocked && "Detected Anti-Bot/IP Block. Rotate session proxy to a residential or stealth endpoint, then retry."}
                      {isConfig && "Detected Structural Change. Selectors timed out or login URL failed. Update the site configuration before retrying."}
                      {isTransient && "Detected Transient Failure (429 Rate Limit or Connection Reset). A standard retry usually resolves this."}
                    </p>
                  </div>
                  
                  {isBlocked && (
                    <div className="mt-4 space-y-2">
                      <Label className="text-xs text-muted-foreground">Select alternative proxy</Label>
                      <Select 
                        value={selectedProxyMap[idx] || ""} 
                        onValueChange={(val) => setSelectedProxyMap({...selectedProxyMap, [idx]: val})}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Premium (ScrapingBee default)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none_premium">Premium (ScrapingBee default)</SelectItem>
                          <SelectItem value="stealth">Stealth (75 credits)</SelectItem>
                          {proxies.filter(p => p.enabled).map(p => (
                            <SelectItem key={p.id} value={p.id}>External: {p.label || p.host}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-3 border-t border-border/40 mt-auto">
                  {isConfig ? (
                    <Button variant="secondary" className="w-full text-xs h-8" onClick={() => navigate("/settings")}>
                      <Wrench className="h-3 w-3 mr-2" /> Edit Site Config
                    </Button>
                  ) : (
                    <Button 
                      className="w-full text-xs h-8" 
                      onClick={() => launchRetryMut.mutate({ 
                        issue, 
                        proxyId: selectedProxyMap[idx] !== "none_premium" && selectedProxyMap[idx] !== "stealth" ? selectedProxyMap[idx] : null 
                      })}
                      disabled={launchRetryMut.isPending}
                    >
                      <RefreshCw className={`h-3 w-3 mr-2 ${launchRetryMut.isPending ? 'animate-spin' : ''}`} /> 
                      Retry with Suggestions ({issue.count} Credentials)
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}