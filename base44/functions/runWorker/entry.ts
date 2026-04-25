import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Claims up to `concurrency` queued TestResults for a run, tests them in parallel,
// and updates the TestRun counters. Designed to be invoked repeatedly from the UI
// (simple polling) so runs survive page refresh.

// --- Smart error classification (mirrors lib/errorClass.js, kept inline so
// each backend function can be deployed independently — no shared imports.)
const ERR_PATTERNS = [
  { kind: 'transient', re: /\b(429|too many requests|rate.?limit)\b/i, label: 'Rate limited' },
  { kind: 'transient', re: /\b(timeout|timed.?out|etimedout|navigation: timeout)\b/i, label: 'Timeout' },
  { kind: 'transient', re: /\b(econnreset|enetunreach|socket hang up|network error)\b/i, label: 'Network' },
  { kind: 'transient', re: /\bbrowserless 5\d\d\b/i, label: 'Browserless 5xx' },
  { kind: 'blocked', re: /\b(captcha|challenge|cloudflare)\b/i, label: 'Captcha' },
  { kind: 'blocked', re: /\b(403|forbidden|access.?denied|blocked|ip.?block)\b/i, label: 'IP blocked' },
  { kind: 'blocked', re: /\bproxy\s+(error|auth|denied|refused)\b/i, label: 'Proxy error' },
  { kind: 'config', re: /username field not found/i, label: 'Selector missing' },
  { kind: 'config', re: /no login_url/i, label: 'No login URL' },
  { kind: 'config', re: /\b(404|not found)\b/i, label: 'Login URL 404' },
  { kind: 'config', re: /credential deleted/i, label: 'Credential gone' },
];
function classifyError(message) {
  if (!message) return { kind: 'unknown', label: 'Unknown' };
  for (const p of ERR_PATTERNS) if (p.re.test(message)) return { kind: p.kind, label: p.label };
  return { kind: 'unknown', label: 'Unknown' };
}
function shouldRetryError(message, attempts, maxRetries) {
  const cls = classifyError(message);
  if (cls.kind === 'config') return false;        // never retry — site/data is wrong
  if (cls.kind === 'blocked') return attempts < 1; // one retry max
  return attempts < maxRetries;                    // transient + unknown
}

async function testOne(base44, site, result, run) {
  const started = Date.now();
  try {
    const cred = await base44.asServiceRole.entities.Credential.filter({ id: result.credential_id });
    const credential = cred[0];
    if (!credential) {
      return { status: 'error', error_message: 'Credential deleted', elapsed_ms: 0 };
    }

    const res = await base44.functions.invoke('testCredential', {
      username: credential.username,
      password: credential.password,
      extra_passwords: credential.extra_passwords || [],
      site_key: site.key,
      target_site_keys: Array.isArray(run.target_site_keys) && run.target_site_keys.length > 0 ? run.target_site_keys : undefined,
      custom_url: run.custom_url || undefined,
      strategy: run.login_strategy || undefined,
      proxy: {
        proxy_mode: run.proxy_mode,
        country_code: run.country_code,
        proxy_city: run.proxy_city,
        proxy_sticky: run.proxy_sticky,
        proxy_locale_match: run.proxy_locale_match,
        proxy_preset: run.proxy_preset,
        external_proxy_id: run.external_proxy_id,
      },
    });

    const data = res?.data || res;
    return {
      status: data.status || 'error',
      final_url: data.final_url,
      success_marker_found: data.success_marker_found,
      working_password: data.working_password,
      error_message: data.error_message,
      elapsed_ms: data.elapsed_ms ?? (Date.now() - started),
    };
  } catch (e) {
    return {
      status: 'error',
      error_message: e.message,
      elapsed_ms: Date.now() - started,
    };
  }
}

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

    if (run.status === 'cancelled' || run.status === 'completed' || run.status === 'failed') {
      return Response.json({ done: true, status: run.status });
    }

    // L1 fix: Stuck-recovery via cheap probe instead of a 5k-row scan.
    // We only need the SINGLE most recently tested row. If THAT row's
    // tested_at is fresher than IDLE_MAX_MS ago, we're not stuck — bail.
    // Only when the cheap probe says "looks idle" do we pay for the full
    // scan needed to enumerate the stuck rows.
    const IDLE_MAX_MS = 5 * 60 * 1000;
    const now = Date.now();
    const startedAt = run.started_at ? new Date(run.started_at).getTime() : null;
    if (startedAt) {
      const probe = await base44.asServiceRole.entities.TestResult.filter({ run_id }, '-tested_at', 1);
      const lastTested = probe[0]?.tested_at ? new Date(probe[0].tested_at).getTime() : 0;
      const idle = lastTested === 0 ? (now - startedAt) : (now - lastTested);
      if (idle > IDLE_MAX_MS) {
        // Confirmed idle — now do the expensive scan to recover.
        const active = await base44.asServiceRole.entities.TestResult.filter({ run_id }, '-tested_at', 5000);
        const stuck = active.filter((r) => r.status === 'queued' || r.status === 'running');
        await Promise.all(stuck.map((r) =>
          base44.asServiceRole.entities.TestResult.update(r.id, {
            status: 'error',
            error_message: 'Stuck run auto-recovered (no progress)',
            tested_at: new Date().toISOString(),
          })
        ));
        // Single-pass tally over the snapshot we already have, applying
        // the stuck→error transition in-memory (avoids a second 5k-row read).
        const stuckIds = new Set(stuck.map((r) => r.id));
        let working = 0, failed = 0, errored = 0;
        for (const r of active) {
          if (stuckIds.has(r.id)) { errored++; continue; }
          if (r.status === 'working') working++;
          else if (r.status === 'failed') failed++;
          else if (r.status === 'error') errored++;
        }
        await base44.asServiceRole.entities.TestRun.update(run_id, {
          status: 'failed',
          ended_at: new Date().toISOString(),
          elapsed_ms: now - startedAt,
          pending_count: 0,
          working_count: working,
          failed_count: failed,
          error_count: errored,
        });
        return Response.json({ done: true, recovered: true, stuck: stuck.length });
      }
    }

    const sites = await base44.asServiceRole.entities.Site.filter({ key: run.site_key });
    const site = sites[0];
    if (!site) return Response.json({ error: `Site ${run.site_key} missing` }, { status: 404 });

    // Claim a batch
    const concurrency = Math.max(1, Math.min(5, run.concurrency || 2));
    const queued = await base44.asServiceRole.entities.TestResult.filter(
      { run_id, status: 'queued' },
      '-created_date',
      concurrency
    );

    if (queued.length === 0) {
      // L2 fix: Trust the incremental counters first. If pending_count says 0
      // AND there are no running rows, we're done — no full scan needed. Only
      // if the counters look inconsistent (pending=0 but a running row exists)
      // do we fall back to the authoritative recount.
      const stillRunningProbe = await base44.asServiceRole.entities.TestResult.filter(
        { run_id, status: 'running' }, '-created_date', 1
      );
      const stillRunning = stillRunningProbe.length > 0;
      if (!stillRunning) {
        // Use cached counters — they were reconciled at the last batch's
        // completion or by the cancelRun path.
        await base44.asServiceRole.entities.TestRun.update(run_id, {
          status: 'completed',
          ended_at: new Date().toISOString(),
          elapsed_ms: run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0,
          pending_count: 0,
          working_count: run.working_count || 0,
          failed_count: run.failed_count || 0,
          error_count: run.error_count || 0,
        });
      }
      return Response.json({ done: true, processed: 0 });
    }

    // Mark as running + claim
    if (run.status !== 'running') {
      await base44.asServiceRole.entities.TestRun.update(run_id, {
        status: 'running',
        started_at: run.started_at || new Date().toISOString(),
      });
    }

    // A1: Claim by transitioning queued → running in one pass. The cron is now
    // the only writer (client-side leader removed in D9), so the prior double-
    // read defensive check is dead code.
    const claimable = queued;
    await Promise.all(claimable.map((r) =>
      base44.asServiceRole.entities.TestResult.update(r.id, {
        status: 'running',
        attempts: (r.attempts || 0) + 1,
      })
    ));

    // Execute in parallel
    const outcomes = await Promise.all(claimable.map((r) => testOne(base44, site, r, run)));

    // Persist results + smart retry. Errors are classified into transient /
    // blocked / config / unknown buckets — config errors (e.g. selector missing)
    // never retry; blocked errors (captcha, 403) get one retry max; everything
    // else uses the run's retry budget.
    const maxRetries = run.max_retries ?? 1;
    await Promise.all(claimable.map(async (r, i) => {
      const o = outcomes[i];
      const attempts = (r.attempts || 0) + 1;
      const errClass = o.status === 'error' ? classifyError(o.error_message) : null;
      const shouldRetry = o.status === 'error' && shouldRetryError(o.error_message, attempts, maxRetries);
      const finalStatus = shouldRetry ? 'queued' : o.status;

      // Tag the error message with its class so the UI can render a friendly
      // label without re-parsing. e.g. "[Selector missing] username field not found".
      const taggedMessage = errClass && o.error_message
        ? `[${errClass.label}] ${o.error_message}`
        : (o.error_message || null);

      await base44.asServiceRole.entities.TestResult.update(r.id, {
        status: finalStatus,
        attempts,
        final_url: o.final_url || null,
        success_marker_found: !!o.success_marker_found,
        error_message: taggedMessage,
        elapsed_ms: o.elapsed_ms || 0,
        tested_at: new Date().toISOString(),
      });

      // L3 fix: Mirror to Credential WITHOUT the read-then-write round trip.
      // We don't need the existing `attempts` value — only the new fields
      // matter for UI display, and `attempts` on Credential was a derived
      // counter that's only ever incremented here. Dropping the read halves
      // the network calls per terminal row.
      if (!shouldRetry && (o.status === 'working' || o.status === 'failed' || o.status === 'error')) {
        try {
          const credStatus = o.status === 'working' ? 'working' : o.status === 'failed' ? 'failed' : 'error';
          await base44.asServiceRole.entities.Credential.update(r.credential_id, {
            status: credStatus,
            last_tested: new Date().toISOString(),
            last_result_note: o.error_message || (o.final_url ? `→ ${o.final_url}` : null),
            ...(o.working_password ? { working_password: o.working_password } : {}),
          });
        } catch (_) { /* credential may have been deleted — ignore */ }
      }
    }));

    // A2: Incremental counter update. Compute deltas from THIS batch's outcomes
    // instead of re-reading all results every tick. Only do a full recount on
    // completion (pending hits 0) as a consistency check.
    let dWorking = 0, dFailed = 0, dErrored = 0, dPending = 0;
    for (let i = 0; i < claimable.length; i++) {
      const o = outcomes[i];
      const attempts = (claimable[i].attempts || 0) + 1;
      const willRetry = o.status === 'error' && shouldRetryError(o.error_message, attempts, run.max_retries ?? 1);
      if (willRetry) continue; // stays queued, no counter change (was running, going back to queued)
      dPending -= 1; // leaving the queued/running pool
      if (o.status === 'working') dWorking += 1;
      else if (o.status === 'failed') dFailed += 1;
      else dErrored += 1;
    }
    // Note: rows that go back to 'queued' (retry) were 'running' in our pool —
    // we already counted them as pending before, so no adjustment needed.

    const newPending = Math.max(0, (run.pending_count ?? 0) + dPending);
    const isDone = newPending === 0;

    let updatePayload = {
      pending_count: newPending,
      working_count: (run.working_count || 0) + dWorking,
      failed_count: (run.failed_count || 0) + dFailed,
      error_count: (run.error_count || 0) + dErrored,
    };

    if (isDone) {
      // Reconcile from source of truth on completion — guards against drift.
      const all = await base44.asServiceRole.entities.TestResult.filter({ run_id }, '-created_date', 5000);
      updatePayload = {
        pending_count: all.filter((r) => r.status === 'queued' || r.status === 'running').length,
        working_count: all.filter((r) => r.status === 'working').length,
        failed_count: all.filter((r) => r.status === 'failed').length,
        error_count: all.filter((r) => r.status === 'error').length,
        status: 'completed',
        ended_at: new Date().toISOString(),
        elapsed_ms: run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0,
      };
    }

    await base44.asServiceRole.entities.TestRun.update(run_id, updatePayload);

    return Response.json({ done: isDone, processed: claimable.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});