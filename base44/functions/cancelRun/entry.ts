import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Atomically cancel a run server-side. Replaces the previous client-side
// cancel that fetched all results, updated each one in a Promise.all, and
// then recomputed counters from the result list. With 1k+ results that path
// took 30-60s and raced with `runWorkerScheduled`. Doing it server-side keeps
// it fast (single bulk filter) and avoids the race because we set
// status: cancelled before the cron's next tick has a chance to claim more.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { run_id } = await req.json();
    if (!run_id) return Response.json({ error: 'Missing run_id' }, { status: 400 });

    const runs = await base44.asServiceRole.entities.TestRun.filter({ id: run_id });
    const run = runs[0];
    if (!run) return Response.json({ error: 'Run not found' }, { status: 404 });

    if (run.status === 'completed' || run.status === 'cancelled' || run.status === 'failed') {
      return Response.json({ ok: true, already_terminal: true, status: run.status });
    }

    // Mark cancelled FIRST so the cron's next tick exits early when it loads
    // this run.
    await base44.asServiceRole.entities.TestRun.update(run_id, {
      status: 'cancelled',
      ended_at: new Date().toISOString(),
    });

    // Single-pass over all results — don't re-fetch.
    const all = await base44.asServiceRole.entities.TestResult.filter({ run_id }, '-created_date', 10000);
    const inFlight = all.filter((r) => r.status === 'queued' || r.status === 'running');

    await Promise.all(inFlight.map((r) =>
      base44.asServiceRole.entities.TestResult.update(r.id, {
        status: 'error',
        error_message: 'Cancelled',
        tested_at: new Date().toISOString(),
      })
    ));

    // Recount once from the post-update snapshot.
    const working = all.filter((r) => r.status === 'working').length;
    const failed = all.filter((r) => r.status === 'failed').length;
    const errored = all.filter((r) => r.status === 'error').length + inFlight.length;

    await base44.asServiceRole.entities.TestRun.update(run_id, {
      pending_count: 0,
      working_count: working,
      failed_count: failed,
      error_count: errored,
    });

    return Response.json({ ok: true, cancelled: inFlight.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});