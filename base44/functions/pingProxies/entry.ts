import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Pings each enabled external Proxy via direct TCP connect to measure
// reachability + latency. Updates Proxy.status / latency_ms / last_check.
// Designed to be called either manually (from the Settings UI) or on a
// daily schedule.
//
// Previously used Browserless, but the app now routes external proxies to
// ScrapingBee via own_proxy. A direct TCP probe is faster, cheaper, and
// matches the approach used in testWireguardProxy.

async function tcpProbe(host, port, timeoutMs) {
  const started = Date.now();
  try {
    const conn = await Promise.race([
      Deno.connect({ hostname: host, port: Number(port), transport: 'tcp' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    if (conn) {
      try { conn.close(); } catch (_) {}
      return { ok: true, latency: Date.now() - started };
    }
    return { ok: false, latency: Date.now() - started, error: 'no connection' };
  } catch (e) {
    return { ok: false, latency: Date.now() - started, error: e.message };
  }
}

function classify(ok, latency) {
  if (!ok) return 'down';
  if (latency > 1500) return 'degraded';
  return 'healthy';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    // Allow scheduled invocation (no user) and authenticated UI invocation.
    if (req.headers.get('x-base44-trigger') !== 'scheduled' && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settingsRows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
    const settings = settingsRows[0] || {};
    const timeoutMs = Math.max(1000, Math.min(30000, Number(settings.proxy_ping_timeout_ms) || 5000));

    const proxies = await base44.asServiceRole.entities.Proxy.list('-created_date', 200);
    // WireGuard entries have their own dedicated tester (testWireguardProxy)
    // that parses the .conf file. Skip them here so we don't false-flag them
    // as "down" via a TCP probe to a UDP-only endpoint.
    const targets = proxies.filter(
      (p) => p.enabled !== false && p.host && p.port && p.protocol !== 'wireguard'
    );

    if (targets.length === 0) {
      return Response.json({ checked: 0, results: [] });
    }

    // allSettled so a single timed-out proxy doesn't hold up the rest.
    const results = await Promise.allSettled(targets.map(async (p) => {
      const r = await tcpProbe(p.host, p.port, timeoutMs);
      const status = classify(r.ok, r.latency);
      await base44.asServiceRole.entities.Proxy.update(p.id, {
        status,
        latency_ms: r.latency,
        last_check: new Date().toISOString(),
      });
      return { id: p.id, label: p.label || `${p.host}:${p.port}`, status, latency_ms: r.latency, error: r.error };
    })).then((settled) => settled.map((s, i) => s.status === 'fulfilled'
      ? s.value
      : { id: targets[i].id, label: targets[i].label || `${targets[i].host}:${targets[i].port}`, status: 'down', error: s.reason?.message }
    ));

    return Response.json({ checked: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});