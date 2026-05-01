import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Activity as ActivityIcon, Loader2, CheckCircle2, XCircle, PlayCircle, Download } from "lucide-react";
import { toCsv, downloadFile } from "@/lib/download";
import { toast } from "sonner";

export default function Activity() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => base44.entities.AuditLog.list("-created_date", 100),
    refetchInterval: 5000,
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case "success": return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "failed":
      case "error": return <XCircle className="w-4 h-4 text-destructive" />;
      case "started":
      case "running": return <PlayCircle className="w-4 h-4 text-info" />;
      default: return <ActivityIcon className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const exportCsv = () => {
    if (!logs?.length) return toast.error("No activity to export");
    const csv = toCsv(logs, [
      { label: "ID", key: "id" },
      { label: "Time", value: (l) => l.timestamp || l.created_date },
      { label: "Target", key: "target" },
      { label: "Name", key: "name" },
      { label: "Status", key: "status" },
      { label: "Metadata", key: "metadata" },
    ]);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadFile(`activity-${stamp}.csv`, csv);
    toast.success(`Exported ${logs.length} activity records`);
  };

  const exportJson = () => {
    if (!logs?.length) return toast.error("No activity to export");
    const json = JSON.stringify(logs, null, 2);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadFile(`activity-${stamp}.json`, json, "application/json");
    toast.success(`Exported ${logs.length} activity records as JSON`);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "success": return "bg-success/10 text-success border-success/20";
      case "failed":
      case "error": return "bg-destructive/10 text-destructive border-destructive/20";
      case "started":
      case "running": return "bg-info/10 text-info border-info/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity Dashboard</h1>
          <p className="text-muted-foreground">Monitor Cloud Function executions and Stagehand runs.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!logs?.length} className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} disabled={!logs?.length} className="gap-2">
            <Download className="w-4 h-4" /> Export JSON
          </Button>
          <ActivityIcon className="w-8 h-8 text-muted-foreground opacity-50 ml-2" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs?.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No activity recorded yet.</div>
          ) : (
            <div className="space-y-4">
              {logs?.map((log) => (
                <div key={log.id} className="flex items-start justify-between p-4 rounded-lg border border-border bg-card/50">
                  <div className="flex items-start space-x-4">
                    <div className="mt-1">{getStatusIcon(log.status)}</div>
                    <div>
                      <p className="font-medium">{log.name}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="outline" className="text-xs font-mono">{log.target}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {log.timestamp ? format(new Date(log.timestamp), "PPpp") : format(new Date(log.created_date), "PPpp")}
                        </span>
                      </div>
                      {log.metadata && (
                        <pre className="mt-2 text-xs bg-muted/50 p-2 rounded overflow-x-auto max-w-[500px]">
                          {log.metadata}
                        </pre>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={getStatusColor(log.status)}>
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}