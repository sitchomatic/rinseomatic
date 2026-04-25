import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Square, CheckCircle2, XCircle, AlertTriangle, Loader2, Download } from "lucide-react";
import { toCsv, downloadFile } from "@/lib/download";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatusPill from "@/components/shared/StatusPill";
import SiteChip from "@/components/shared/SiteChip";
import ResultsTable from "@/components/runs/ResultsTable";
import { formatMs } from "@/lib/sites";
import { toast } from "sonner";
import { useRunWorker } from "@/lib/useRunWorker";
import { useLiveResults } from "@/lib/useLiveResults";

export default function RunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState("all");

  const { data: run, isLoading: runLoading, isError: runError } = useQuery({
    queryKey: ["test-run", id],
    queryFn: async () => (await base44.entities.TestRun.filter({ id }))[0] || null,
    refetchInterval: 2000,
    enabled: !!id,
  });

  const { data: results = [] } = useLiveResults(id);

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
  });
  const siteLabel = sites.find((s) => s.key === run?.site_key)?.label || run?.site_key;

  useRunWorker(run);

  const cancelMut = useMutation({
    mutationFn: async () => {
      const queued = await base44.entities.TestResult.filter({ run_id: id, status: "queued" }, "-created_date", 5000);
      await Promise.all(queued.map((r) => base44.entities.TestResult.update(r.id, { status: "error", error_message: "Cancelled" })));
      await base44.entities.TestRun.update(id, {
        status: "cancelled",
        ended_at: new Date().toISOString(),
        pending_count: 0,
        error_count: (run?.error_count || 0) + queued.length,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-run", id] });
      qc.invalidateQueries({ queryKey: ["test-results", id] });
      toast.success("Run cancelled");
    },
  });

  if (runLoading) {
    return (
      <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
        <div className="rounded-xl border border-border bg-card/40 py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!run || runError) {
    return (
      <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
        <Link to="/runs" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-mono uppercase tracking-wider mb-4">
          <ArrowLeft className="h-3 w-3" /> back to runs
        </Link>
        <div className="rounded-xl border border-dashed border-border bg-card/40 py-20 text-center">
          <div className="text-sm font-medium mb-1">Run not found</div>
          <div className="text-xs text-muted-foreground">It may have been deleted. <button onClick={() => navigate("/runs")} className="text-primary hover:underline">View all runs</button></div>
        </div>
      </div>
    );
  }

  const pct = run.total_count ? Math.round(((run.total_count - (run.pending_count || 0)) / run.total_count) * 100) : 0;

  const filtered = tab === "all" ? results : results.filter((r) => r.status === tab);

  const exportCsv = () => {
    if (!results.length) return toast.error("No results to export");
    const csv = toCsv(filtered, [
      { label: "Username", key: "username" },
      { label: "Status", key: "status" },
      { label: "Attempts", key: "attempts" },
      { label: "Final URL", key: "final_url" },
      { label: "Success Marker", value: (r) => r.success_marker_found ? "true" : "false" },
      { label: "Error", key: "error_message" },
      { label: "Elapsed (ms)", key: "elapsed_ms" },
      { label: "Tested At", value: (r) => r.tested_at || "" },
    ]);
    const stamp = format(new Date(), "yyyyMMdd-HHmm");
    const slug = (run.label || run.site_key || "run").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadFile(`${slug}-${tab}-${stamp}.csv`, csv);
    toast.success(`Exported ${filtered.length} rows`);
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <Link to="/runs" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-mono uppercase tracking-wider mb-4">
        <ArrowLeft className="h-3 w-3" /> back to runs
      </Link>

      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><SiteChip siteKey={run.site_key} label={siteLabel} size="sm" /> · run detail</span>}
        title={run.label || "Untitled run"}
        description={`${run.total_count} credentials · concurrency ${run.concurrency} · ${run.max_retries ?? 1} ${(run.max_retries ?? 1) === 1 ? "retry" : "retries"}`}
        actions={
          <>
            <StatusPill status={run.status} />
            <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={results.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            {(run.status === "running" || run.status === "queued") && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => cancelMut.mutate()}>
                <Square className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Tile label="Progress" icon={Loader2} spin={run.status === "running"} value={`${pct}%`} sub={`${run.total_count - (run.pending_count || 0)}/${run.total_count}`} />
        <Tile label="Working" icon={CheckCircle2} accent="text-emerald-300" value={run.working_count || 0} />
        <Tile label="Failed" icon={XCircle} accent="text-rose-300" value={run.failed_count || 0} />
        <Tile label="Errored" icon={AlertTriangle} accent="text-amber-300" value={run.error_count || 0} />
        <Tile label="Elapsed" value={formatMs(run.elapsed_ms)} sub={run.status} />
      </div>

      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-6">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border border-border mb-4">
          <TabsTrigger value="all">All <span className="ml-2 text-muted-foreground font-mono">{results.length}</span></TabsTrigger>
          <TabsTrigger value="working">Working <span className="ml-2 text-emerald-300 font-mono">{results.filter((r) => r.status === "working").length}</span></TabsTrigger>
          <TabsTrigger value="failed">Failed <span className="ml-2 text-rose-300 font-mono">{results.filter((r) => r.status === "failed").length}</span></TabsTrigger>
          <TabsTrigger value="error">Error <span className="ml-2 text-amber-300 font-mono">{results.filter((r) => r.status === "error").length}</span></TabsTrigger>
          <TabsTrigger value="queued">Queued <span className="ml-2 text-muted-foreground font-mono">{results.filter((r) => r.status === "queued" || r.status === "running").length}</span></TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <ResultsTable results={filtered} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Tile({ label, icon: Icon, accent, value, sub, spin }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
        {Icon && <Icon className={`h-3.5 w-3.5 ${accent || "text-muted-foreground"} ${spin ? "animate-spin" : ""}`} />}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${accent || ""}`}>{value}</div>
      {sub && <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}