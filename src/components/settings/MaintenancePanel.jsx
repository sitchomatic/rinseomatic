import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Play, RefreshCw, Save, Wrench } from "lucide-react";
import { toast } from "sonner";

export default function MaintenancePanel() {
  const qc = useQueryClient();
  const [last, setLast] = React.useState(null);
  const [draft, setDraft] = React.useState(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.list("-created_date", 1),
    staleTime: 60_000,
  });
  const settings = rows[0];

  React.useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  const saveMut = useMutation({
    mutationFn: async (d) => d.id
      ? base44.entities.AppSettings.update(d.id, d)
      : base44.entities.AppSettings.create({ ...d, singleton_key: "global" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["app-settings"] }); toast.success("Maintenance settings saved"); },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

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
            Manual controls and shared settings for queued-run processing, auto-healing, proxy checks, and diagnostics.
          </div>
        </div>
        {draft && (
          <Button size="sm" className="gap-1.5 h-7" onClick={() => saveMut.mutate(draft)} disabled={saveMut.isPending}>
            <Save className="h-3 w-3" /> {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      {draft && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 rounded-md border border-border bg-background/40 p-3">
          <Field label="Worker max runs" help="Runs processed per scheduled tick.">
            <Input type="number" value={draft.worker_max_parallel_runs ?? 10} onChange={(e) => setDraft({ ...draft, worker_max_parallel_runs: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="Auto-heal idle ms" help="Running rows older than this are requeued.">
            <Input type="number" value={draft.auto_heal_idle_max_ms ?? 240000} onChange={(e) => setDraft({ ...draft, auto_heal_idle_max_ms: Number(e.target.value) || 60000 })} />
          </Field>
          <Field label="Reclaim budget" help="Max stuck rows per run per cycle.">
            <Input type="number" value={draft.auto_heal_reclaim_budget ?? 200} onChange={(e) => setDraft({ ...draft, auto_heal_reclaim_budget: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="Proxy ping timeout" help="TCP proxy health timeout.">
            <Input type="number" value={draft.proxy_ping_timeout_ms ?? 5000} onChange={(e) => setDraft({ ...draft, proxy_ping_timeout_ms: Number(e.target.value) || 1000 })} />
          </Field>
          <Field label="Diagnostics timeout" help="ScrapingBee diagnostics timeout.">
            <Input type="number" value={draft.diagnostics_probe_timeout_ms ?? 30000} onChange={(e) => setDraft({ ...draft, diagnostics_probe_timeout_ms: Number(e.target.value) || 1000 })} />
          </Field>
        </div>
      )}

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

function Field({ label, help, children }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
      {help && <p className="text-[10px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}