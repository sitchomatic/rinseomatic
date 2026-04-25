// Server-side cron that progresses ALL active runs without needing an open tab.
// Called by a scheduled automation every 5 minutes.
//
// Strategy:
//   1. Find every TestRun in 'queued' or 'running' state.
//   2. Invoke runWorker for each one (in parallel waves).
//   3. runWorker itself handles claiming, executing, retrying, completing,
//      and stuck-recovery — we just keep the wheel turning.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MAX_PARALLEL_RUNS = 4;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow either a logged-in admin (manual kick from UI) or service-role
    // invocation (the scheduled automation, which has no end-user token).
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* unauth = scheduled */ }
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const queued = await base44.asServiceRole.entities.TestRun.filter({ status: 'queued' }, '-created_date', 50);
    const running = await base44.asServiceRole.entities.TestRun.filter({ status: 'running' }, '-created_date', 50);
    const active = [...queued, ...running];

    if (active.length === 0) {
      return Response.json({ done: true, ran: 0 });
    }

    let processed = 0;
    for (let i = 0; i < active.length; i += MAX_PARALLEL_RUNS) {
      const wave = active.slice(i, i + MAX_PARALLEL_RUNS);
      await Promise.all(wave.map(async (run) => {
        try {
          await base44.asServiceRole.functions.invoke('runWorker', { run_id: run.id });
          processed++;
        } catch (e) {
          console.error(`runWorker failed for ${run.id}:`, e?.message);
        }
      }));
    }

    return Response.json({ done: true, total: active.length, processed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});