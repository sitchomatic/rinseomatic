import React from "react";
import { base44 } from "@/api/base44Client";
import { startRunLeader } from "@/lib/runLeader";

// Polls runWorker while a run is active. Cross-tab safe via leader election:
// only one tab actually invokes the worker per run, so queued results aren't
// double-claimed. Followers idle until the leader's tab is closed/backgrounded.
export function useRunWorker(run, { intervalMs = 2000 } = {}) {
  const running = run?.status === "running" || run?.status === "queued";

  React.useEffect(() => {
    if (!run?.id || !running) return;

    const lead = startRunLeader(run.id);
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      if (lead.isLeader()) {
        try {
          await base44.functions.invoke("runWorker", { run_id: run.id });
        } catch (_) { /* swallow — next tick retries */ }
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      lead.stop();
    };
  }, [run?.id, running, intervalMs]);
}