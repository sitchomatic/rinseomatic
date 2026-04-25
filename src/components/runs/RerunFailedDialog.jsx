import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";

// Re-runs a previous run's failed/errored results as a new TestRun against
// the same site, using the same proxy / strategy / concurrency settings.
// User picks which buckets (errored, failed) to include.
export default function RerunFailedDialog({ open, onOpenChange, run, results }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [includeError, setIncludeError] = React.useState(true);
  const [includeFailed, setIncludeFailed] = React.useState(false);

  const errorIds = React.useMemo(() => results.filter((r) => r.status === "error").map((r) => r.credential_id), [results]);
  const failedIds = React.useMemo(() => results.filter((r) => r.status === "failed").map((r) => r.credential_id), [results]);

  const credentialIds = React.useMemo(() => {
    const ids = new Set();
    if (includeError) errorIds.forEach((i) => ids.add(i));
    if (includeFailed) failedIds.forEach((i) => ids.add(i));
    return [...ids];
  }, [includeError, includeFailed, errorIds, failedIds]);

  const mut = useMutation({
    mutationFn: async () => {
      if (credentialIds.length === 0) throw new Error("Nothing to re-run");
      // Pull credentials in chunks so we can stamp username on each result row.
      const CHUNK = 100;
      const creds = [];
      for (let i = 0; i < credentialIds.length; i += CHUNK) {
        const batch = credentialIds.slice(i, i + CHUNK);
        const found = await base44.entities.Credential.filter({ id: { $in: batch } }, "-created_date", CHUNK);
        creds.push(...found);
      }
      if (creds.length === 0) throw new Error("Source credentials no longer exist");

      const newRun = await base44.entities.TestRun.create({
        label: `Re-run · ${run.label || run.site_key} · ${format(new Date(), "MMM d HH:mm")}`,
        site_key: run.site_key,
        target_site_keys: run.target_site_keys || undefined,
        custom_url: run.custom_url || undefined,
        status: "queued",
        concurrency: run.concurrency || 2,
        max_retries: run.max_retries ?? 1,
        login_strategy: run.login_strategy || undefined,
        proxy_mode: run.proxy_mode || undefined,
        country_code: run.country_code || undefined,
        external_proxy_id: run.external_proxy_id || undefined,
        total_count: creds.length,
        pending_count: creds.length,
        working_count: 0,
        failed_count: 0,
        error_count: 0,
      });

      const ROW_CHUNK = 100;
      const rows = creds.map((c) => ({
        run_id: newRun.id,
        credential_id: c.id,
        site_key: run.site_key,
        username: c.username,
        status: "queued",
        attempts: 0,
        elapsed_ms: 0,
      }));
      for (let i = 0; i < rows.length; i += ROW_CHUNK) {
        await base44.entities.TestResult.bulkCreate(rows.slice(i, i + ROW_CHUNK));
      }
      base44.functions.invoke("runWorker", { run_id: newRun.id }).catch(() => {});
      return newRun;
    },
    onSuccess: (newRun) => {
      qc.invalidateQueries({ queryKey: ["test-runs"] });
      toast.success(`Re-run launched · ${newRun.total_count} credential${newRun.total_count === 1 ? "" : "s"}`);
      onOpenChange(false);
      navigate(`/runs/${newRun.id}`);
    },
    onError: (e) => toast.error(e?.message || "Couldn't launch re-run"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Re-run failures</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-snug">
            Creates a new run against <span className="font-mono text-foreground">{run.site_key}</span> using the same proxy &amp; strategy settings.
          </p>
          <Row
            checked={includeError}
            onChange={setIncludeError}
            label="Errored"
            count={errorIds.length}
            help="Transient errors (timeout, blocked, network)."
          />
          <Row
            checked={includeFailed}
            onChange={setIncludeFailed}
            label="Failed"
            count={failedIds.length}
            help="Wrong password / didn't reach success marker."
          />
          <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
            Will queue <span className="text-foreground">{credentialIds.length}</span> credential{credentialIds.length === 1 ? "" : "s"}.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={credentialIds.length === 0 || mut.isPending}>
            {mut.isPending ? "Launching…" : "Launch re-run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ checked, onChange, label, count, help }) {
  return (
    <label className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-secondary/30">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs font-mono text-muted-foreground">{count}</span>
        </div>
        <div className="text-[11px] text-muted-foreground leading-snug">{help}</div>
      </div>
    </label>
  );
}