import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Loads all TestResults for a run once, then keeps the local cache in sync
// via a real-time subscription on the TestResult entity. Avoids the 2s
// polling that the previous implementation needed.
export function useLiveResults(runId) {
  const qc = useQueryClient();
  const key = ["test-results", runId];

  // L13 fix: subscribe to the sibling run-status query so `isTerminal` is
  // reactive. Previous code read it once at hook-call time, so a run that
  // completed during the user's session would still refetch results on
  // remount. `useQuery` on the same key gives us live status without
  // duplicating the network request.
  const { data: runForStatus } = useQuery({
    queryKey: ["test-run", runId],
    queryFn: async () => (await base44.entities.TestRun.filter({ id: runId }))[0] || null,
    enabled: !!runId,
    staleTime: 1_000, // sibling RunDetail query owns the polling
    refetchOnMount: false,
  });
  const runStatus = runForStatus?.status;
  const isTerminal = runStatus === "completed" || runStatus === "failed" || runStatus === "cancelled";

  const query = useQuery({
    queryKey: key,
    queryFn: () => base44.entities.TestResult.filter({ run_id: runId }, "-created_date", 10000),
    enabled: !!runId,
    staleTime: isTerminal ? Infinity : 30_000,
  });

  // L4 fix: Coalesced subscription updates with O(1) lookups.
  // Previous version did O(n) findIndex on every event AND triggered a full
  // setQueryData (and React re-render) per event. With high-throughput runs
  // we'd see 50+ events/sec, each scanning a 10k-row array.
  //
  // New strategy:
  //   1. Buffer incoming events in a ref keyed by id (latest-write-wins).
  //   2. Flush via requestAnimationFrame — at most one cache write per frame.
  //   3. Apply diffs against the previous list using a Map for O(1) merge.
  React.useEffect(() => {
    if (!runId) return;

    const pending = new Map();   // id → latest row (or {__delete: true})
    let raf = 0;

    const flush = () => {
      raf = 0;
      if (pending.size === 0) return;
      const drain = pending;
      // swap-out before mutating cache so any in-flight events still buffer
      // into a fresh map.
      const events = Array.from(drain.entries());
      drain.clear();

      qc.setQueryData(key, (prev = []) => {
        const map = new Map(prev.map((r) => [r.id, r]));
        for (const [id, payload] of events) {
          if (payload.__delete) map.delete(id);
          else map.set(id, { ...(map.get(id) || {}), ...payload });
        }
        // Preserve previous ordering (newest first), append new ids at top.
        const next = [];
        const seen = new Set();
        for (const r of prev) {
          const cur = map.get(r.id);
          if (cur) { next.push(cur); seen.add(r.id); }
        }
        for (const [id, row] of map) {
          if (!seen.has(id)) next.unshift(row);
        }
        return next;
      });
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(flush);
    };

    const unsub = base44.entities.TestResult.subscribe((event) => {
      if (event.type === "delete") {
        pending.set(event.id, { __delete: true });
        schedule();
        return;
      }
      const row = event?.data;
      if (!row || row.run_id !== runId) return;
      pending.set(row.id, row);
      schedule();
    });

    return () => {
      try { unsub?.(); } catch { /* ignore */ }
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return query;
}