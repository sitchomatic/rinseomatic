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

    // Stuck-run recovery: if a run has been active >10 min with no tested_at progress >5 min,
    // mark it failed and flush queued/running results to 'error'.
    const RUN_MAX_MS = 10 * 60 * 1000;
    const IDLE_MAX_MS = 5 * 60 * 1000;
    const now = Date.now();
    const startedAt = run.started_at ? new Date(run.started_at).getTime() : null;
    if (startedAt && now - startedAt > RUN_MAX_MS) {
      const active = await base44.asServiceRole.entities.TestResult.filter({ run_id }, '-tested_at', 5000);
      const lastTested = active
        .map((r) => (r.tested_at ? new Date(r.tested_at).getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      const idle = lastTested === 0 ? (now - startedAt) : (now - lastTested);
      if (idle > IDLE_MAX_MS) {
        const stuck = active.filter((r) => r.status === 'queued' || r.status === 'running');
        await Promise.all(stuck.map((r) =>
          base44.asServiceRole.entities.TestResult.update(r.id, {
            status: 'error',
            error_message: 'Stuck run auto-recovered (no progress)',
            tested_at: new Date().toISOString(),
          })
        ));
        // After updating `stuck` rows to 'error', re-count from the freshest
        // snapshot to avoid double-counting them in `errored`.
        const fresh = await base44.asServiceRole.entities.TestResult.filter({ run_id }, '-tested_at', 5000);
        const working = fresh.filter((r) => r.status === 'working').length;
        const failed = fresh.filter((r) => r.status === 'failed').length;
        const errored = fresh.filter((r) => r.status === 'error').length;
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
      // Nothing left — mark run completed
      const all = await base44.asServiceRole.entities.TestResult.filter({ run_id }, '-created_date', 5000);
      const stillRunning = all.some((r) => r.status === 'running' || r.status === 'queued');
      if (!stillRunning) {
        const working = all.filter((r) => r.status === 'working').length;
        const failed = all.filter((r) => r.status === 'failed').length;
        const errored = all.filter((r) => r.status === 'error').length;
        await base44.asServiceRole.entities.TestRun.update(run_id, {
          status: 'completed',
          ended_at: new Date().toISOString(),
          elapsed_ms: run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0,
          pending_count: 0,
          working_count: working,
          failed_count: failed,
          error_count: errored,
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

    // Re-read each row before claiming it. Another worker invocation may have
    // already grabbed it (multi-tab leader handover, double-poll, etc.). If the
    // row is no longer 'queued' we drop it from this batch — never double-test.
    const claimChecks = await Promise.all(queued.map((r) =>
      base44.asServiceRole.entities.TestResult.filter({ id: r.id })
    ));
    const claimable = queued.filter((r, i) => (claimChecks[i]?.[0]?.status === 'queued'));
    if (claimable.length === 0) {
      return Response.json({ done: false, processed: 0, skipped: queued.length });
    }

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

      // Mirror to Credential when terminal
      if (!shouldRetry && (o.status === 'working' || o.status === 'failed' || o.status === 'error')) {
        try {
          const credStatus = o.status === 'working' ? 'working' : o.status === 'failed' ? 'failed' : 'error';
          const existing = await base44.asServiceRole.entities.Credential.filter({ id: r.credential_id });
          if (existing[0]) {
            await base44.asServiceRole.entities.Credential.update(r.credential_id, {
              status: credStatus,
              last_tested: new Date().toISOString(),
              last_result_note: o.error_message || (o.final_url ? `→ ${o.final_url}` : null),
              attempts: (existing[0].attempts || 0) + 1,
              ...(o.working_password ? { working_password: o.working_password } : {}),
            });
          }
        } catch (_) { /* ignore */ }
      }
    }));

    // Update run counters
    const all = await base44.asServiceRole.entities.TestResult.filter({ run_id }, '-created_date', 5000);
    const pending = all.filter((r) => r.status === 'queued' || r.status === 'running').length;
    const working = all.filter((r) => r.status === 'working').length;
    const failed = all.filter((r) => r.status === 'failed').length;
    const errored = all.filter((r) => r.status === 'error').length;

    const isDone = pending === 0;
    await base44.asServiceRole.entities.TestRun.update(run_id, {
      pending_count: pending,
      working_count: working,
      failed_count: failed,
      error_count: errored,
      ...(isDone ? {
        status: 'completed',
        ended_at: new Date().toISOString(),
        elapsed_ms: run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0,
      } : {}),
    });

    return Response.json({ done: isDone, processed: claimable.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});