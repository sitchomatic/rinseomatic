// ETA helper for in-progress runs. Uses the run's elapsed time and the
// proportion completed to project how long the remaining items will take.
// Returns null when there's no signal (run hasn't started or is finished).
export function runEta(run) {
  if (!run) return null;
  if (run.status !== "running" && run.status !== "queued") return null;
  const total = run.total_count || 0;
  const pending = run.pending_count ?? total;
  const done = total - pending;
  if (total === 0 || done === 0) return null;

  const startedAt = run.started_at ? new Date(run.started_at).getTime() : null;
  if (!startedAt) return null;
  const elapsed = Date.now() - startedAt;
  if (elapsed <= 0) return null;

  const perItem = elapsed / done;
  const remainingMs = perItem * pending;
  return { remainingMs, perItem };
}

export function formatEta(ms) {
  if (ms == null || !isFinite(ms) || ms < 0) return null;
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}