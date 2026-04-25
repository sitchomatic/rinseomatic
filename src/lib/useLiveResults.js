import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Loads all TestResults for a run once, then keeps the local cache in sync
// via a real-time subscription on the TestResult entity. Avoids the 2s
// polling that the previous implementation needed.
export function useLiveResults(runId) {
  const qc = useQueryClient();
  const key = ["test-results", runId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => base44.entities.TestResult.filter({ run_id: runId }, "-created_date", 5000),
    enabled: !!runId,
    staleTime: 30_000, // subscription handles freshness
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