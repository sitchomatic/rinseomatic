import React from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Play, RefreshCw, Wrench } from "lucide-react";
import { toast } from "sonner";

export default function MaintenancePanel() {
  const [last, setLast] = React.useState(null);

  const workerMut = useMutation({
    mutationFn: () => base44.functions.invoke("runWorkerScheduled", {}),
    onSuccess: (res) => { setLast({ name: "Worker tick", data: res?.data || res }); toast.success("Worker tick completed"); },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  const healMut = useMutation({
    mutationFn: () => base44.functions.invoke("autoHealRuns", {}),
    onSuccess: (res) => { setLast({ name: "Auto-heal", data: res?.data || res }); toast.success("Auto-heal completed"); },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  const busy = workerMut.isPending || healMut.isPending;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Wrench className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Maintenance jobs</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Manual controls for backend jobs that usually run in the background: processing queued runs and reclaiming stuck rows.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => workerMut.mutate()} disabled={busy}>
          {workerMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Run worker tick
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => healMut.mutate()} disabled={busy}>
          {healMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Run auto-heal
        </Button>
      </div>

      {last && (
        <pre className="rounded-md border border-border bg-background/50 p-3 text-[11px] font-mono text-muted-foreground overflow-x-auto thin-scroll whitespace-pre-wrap">
{last.name}: {JSON.stringify(last.data, null, 2)}
        </pre>
      )}
    </div>
  );
}