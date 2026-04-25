import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Loads all TestResults for a run once, then keeps the local cache in sync
// via a real-time subscription on the TestResult entity. Avoids the 2s
// polling that the previous implementation needed.
export function useLiveResults(runId) {
  const qc = useQueryClient();
  const key = ["test-results", runId];

  // B2: Once a run reaches a terminal state, results don't change — we never
  // need to refetch on remount. Active runs use 30s staleTime + the live
  // subscription below for freshness. We only know terminality from the run
  // entity (held in a sibling query), so we reach into the cache for it.
  const runStatus = qc.getQueryData(["test-run", runId])?.status;
  const isTerminal = runStatus === "completed" || runStatus === "failed" || runStatus === "cancelled";

  const query = useQuery({
    queryKey: key,
    queryFn: () => base44.entities.TestResult.filter({ run_id: runId }, "-created_date", 10000),
    enabled: !!runId,
    staleTime: isTerminal ? Infinity : 30_000,
  });

  React.useEffect(() => {
    if (!runId) return;
    const unsub = base44.entities.TestResult.subscribe((event) => {
      const row = event?.data;
      if (!row || row.run_id !== runId) return;

      qc.setQueryData(key, (prev = []) => {
        if (event.type === "delete") {
          return prev.filter((r) => r.id !== event.id);
        }
        // E11: id-keyed dedupe via index lookup. Same row arriving twice
        // (network retry, leader handover) collapses to a single entry.
        const idx = prev.findIndex((r) => r.id === row.id);
        if (idx === -1) return [row, ...prev];
        const next = prev.slice();
        next[idx] = { ...next[idx], ...row };
        return next;
      });
    });
    return () => { try { unsub?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return query;
}