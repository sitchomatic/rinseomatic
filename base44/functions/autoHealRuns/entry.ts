// Fully-automatic auto-heal job. Runs on a schedule. For each non-terminal run:
//   1. Detect stuck rows (status='running' for >IDLE_MAX_MS) and re-queue them
//      so the worker picks them back up.
// All actions are logged to ActionLog with category='system'.
//
// Note: previous versions also auto-rotated proxies on high block rates by
// flipping legacy `proxy_sticky` / `proxy_preset` fields. Those fields no
// longer exist on TestRun (the ScrapingBee model uses `proxy_mode` /
// `country_code` / `external_proxy_id`), so that path was removed. If
// auto-rotation is wanted again it should toggle proxy_mode between
// 'premium' and 'stealth'.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_IDLE_MAX_MS = 4 * 60 * 1000;        // 4 min — a row pinned to 'running' this long is dead
const DEFAULT_STUCK_RECLAIM_BUDGET = 200;          // safety cap per run per cycle

async function log(base44, message, level = 'info') {
  try {
    await base44.asServiceRole.entities.ActionLog.create({
      category: 'system',
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch (_) { /* logging is best-effort */ }
}

async function healOneRun(base44, run, settings) {
  const summary = { run_id: run.id, requeued_stuck: 0, notes: [] };
  const now = Date.now();
  const idleMaxMs = Math.max(60000, Number(settings.auto_heal_idle_max_ms) || DEFAULT_IDLE_MAX_MS);
  const reclaimBudget = Math.max(1, Math.min(1000, Number(settings.auto_heal_reclaim_budget) || DEFAULT_STUCK_RECLAIM_BUDGET));

  // Stuck rows: rows pinned to 'running' for too long get re-queued so the
  // worker picks them up again.
  const running = await base44.asServiceRole.entities.TestResult.filter(
    { run_id: run.id, status: 'running' }, '-tested_at', reclaimBudget
  );
  const stuck = running.filter((r) => {
    const t = r.started_at ? new Date(r.started_at).getTime() : (r.tested_at ? new Date(r.tested_at).getTime() : 0);
    return t > 0 && now - t > idleMaxMs;
  });

  if (stuck.length > 0) {
    await Promise.all(stuck.map((r) =>
      base44.asServiceRole.entities.TestResult.update(r.id, {
        status: 'queued',
        error_message: '[Auto-heal] Reclaimed from stuck running state',
      })
    ));
    summary.requeued_stuck = stuck.length;
    summary.notes.push(`Reclaimed ${stuck.length} stuck rows`);
    await log(base44, `Auto-heal: reclaimed ${stuck.length} stuck rows for run ${run.id}`, 'warn');
  }

  return summary;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    // Allow scheduled invocation (no user) and authenticated UI invocation.
    if (req.headers.get('x-base44-trigger') !== 'scheduled' && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settingsRows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
    const settings = settingsRows[0] || {};

    const active = await base44.asServiceRole.entities.TestRun.filter(
      { status: { $in: ['running', 'queued'] } }, '-created_date', 50
    );

    if (active.length === 0) {
      return Response.json({ ok: true, healed: [], note: 'no active runs' });
    }

    const summaries = [];
    for (const run of active) {
      try {
        const s = await healOneRun(base44, run, settings);
        if (s.requeued_stuck > 0) summaries.push(s);
      } catch (e) {
        await log(base44, `Auto-heal failed for run ${run.id}: ${e.message}`, 'error');
      }
    }

    return Response.json({ ok: true, scanned: active.length, healed: summaries });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});