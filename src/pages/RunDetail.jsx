import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Square, CheckCircle2, XCircle, AlertTriangle, Loader2, Download, Trash2, Clock, RotateCcw } from "lucide-react";
import { toCsv, downloadFile } from "@/lib/download";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatusPill from "@/components/shared/StatusPill";
import SiteChip from "@/components/shared/SiteChip";
import ResultsTable from "@/components/runs/ResultsTable";
import RunScreenshotsGallery from "@/components/runs/RunScreenshotsGallery";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import RerunFailedDialog from "@/components/runs/RerunFailedDialog";
import { formatMs } from "@/lib/sites";
import { runEta, formatEta } from "@/lib/eta";
import { toast } from "sonner";
import { useLiveResults } from "@/lib/useLiveResults";

export default function RunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState("all");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [showRerun, setShowRerun] = React.useState(false);

  const { data: run, isLoading: runLoading, isError: runError } = useQuery({
    queryKey: ["test-run", id],
    queryFn: async () => (await base44.entities.TestRun.filter({ id }))[0] || null,
    // Poll while active. Once the run reaches a terminal state, stop polling
    // (saves ~30 requests/min per open tab indefinitely).
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "running" || s === "queued" ? 500 : false;
    },
    enabled: !!id,
  });

  const { data: results = [] } = useLiveResults(id);

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
    staleTime: 5 * 60_000,
  });
  const siteLabel = sites.find((s) => s.key === run?.site_key)?.label || run?.site_key;

  // Note: client-side worker polling removed — the scheduled `runWorkerScheduled`
  // automation drives progress on the server every 5 minutes. The 2s poll on
  // `useQuery` above keeps the UI live while you watch.

  // Server-side cancel — single backend round-trip, atomic, race-free with cron.
  const cancelMut = useMutation({
    mutationFn: () => base44.functions.invoke("cancelRun", { run_id: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-run", id] });
      qc.invalidateQueries({ queryKey: ["test-results", id] });
      qc.invalidateQueries({ queryKey: ["test-runs"] });
      toast.success("Run cancelled");
    },
    onError: (e) => toast.error(e?.message || "Couldn't cancel run"),
  });

  // Delete run + cascade the result rows. Terminal-only — for active runs
  // the user cancels first.
  // L10 fix: chunked delete (matches L8 in Credentials). 5000 simultaneous
  // DELETEs would saturate the connection pool; 25-at-a-time with sequential
  // batches survives the largest realistic run.
  const deleteMut = useMutation({
    mutationFn: async () => {
      const all = await base44.entities.TestResult.filter({ run_id: id }, "-created_date", 10000);
      const CHUNK = 25;
      for (let i = 0; i < all.length; i += CHUNK) {
        const batch = all.slice(i, i + CHUNK);
        await Promise.all(batch.map((r) => base44.entities.TestResult.delete(r.id)));
      }
      await base44.entities.TestRun.delete(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-runs"] });
      toast.success("Run deleted");
      navigate("/runs");
    },
    onError: (e) => toast.error(e?.message || "Couldn't delete run"),
  });

  // B1: Single-pass aggregator — bucket results once instead of 5 inline filters.
  // Must be declared before any early return to satisfy rules-of-hooks.
  const buckets = React.useMemo(() => {
    const b = { all: results, working: [], failed: [], error: [], queued: [] };
    for (const r of results) {
      if (r.status === "working") b.working.push(r);
      else if (r.status === "failed") b.failed.push(r);
      else if (r.status === "error") b.error.push(r);
      else if (r.status === "queued" || r.status === "running") b.queued.push(r);
    }
    return b;
  }, [results]);

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
  const eta = runEta(run);
  const etaLabel = eta ? formatEta(eta.remainingMs) : null;
  const isTerminal = run.status === "completed" || run.status === "failed" || run.status === "cancelled";

  const filtered = buckets[tab] || results;

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
            {isTerminal && (buckets.error.length > 0 || buckets.failed.length > 0) && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowRerun(true)}>
                <RotateCcw className="h-3.5 w-3.5" /> Re-run failures
              </Button>
            )}
            {(run.status === "running" || run.status === "queued") && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => cancelMut.mutate()}>
                <Square className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
            {isTerminal && (
              <Button
                variant="outline" size="sm"
                className="gap-2 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 border-rose-500/30"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
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
        {etaLabel ? (
          <Tile label="ETA" icon={Clock} accent="text-sky-300" value={`~${etaLabel}`} sub={`${formatMs(run.elapsed_ms)} elapsed`} />
        ) : (
          <Tile label="Elapsed" value={formatMs(run.elapsed_ms)} sub={run.status} />
        )}
      </div>

      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-6">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border border-border mb-4">
          <TabsTrigger value="all">All <span className="ml-2 text-muted-foreground font-mono">{buckets.all.length}</span></TabsTrigger>
          <TabsTrigger value="working">Working <span className="ml-2 text-emerald-300 font-mono">{buckets.working.length}</span></TabsTrigger>
          <TabsTrigger value="failed">Failed <span className="ml-2 text-rose-300 font-mono">{buckets.failed.length}</span></TabsTrigger>
          <TabsTrigger value="error">Error <span className="ml-2 text-amber-300 font-mono">{buckets.error.length}</span></TabsTrigger>
          <TabsTrigger value="queued">Queued <span className="ml-2 text-muted-foreground font-mono">{buckets.queued.length}</span></TabsTrigger>
          <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          {tab === "screenshots" ? (
            <RunScreenshotsGallery results={results} isRunning={run.status === "running" || run.status === "queued"} />
          ) : (
            <ResultsTable results={filtered} />
          )}
        </TabsContent>
      </Tabs>

      <RerunFailedDialog
        open={showRerun}
        onOpenChange={setShowRerun}
        run={run}
        results={results}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this run?"
        description={`"${run.label || "Untitled run"}" and all ${run.total_count || 0} result rows will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete run"
        destructive
        onConfirm={() => deleteMut.mutate()}
      />
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