// Live network diagnostics: pings the configured Browserless region with the
// current proxy settings (or an override) and returns reachability, public IP,
// country, and round-trip latency. Used by the Diagnostics panel in Settings.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function buildBrowserlessUrl(settings, override) {
  const region = override?.browserless_region || settings.browserless_region || 'production-sfo';
  const token = Deno.env.get('BROWSERLESS_TOKEN');
  const params = new URLSearchParams({ token });
  params.set('launch', JSON.stringify({ stealth: true, headless: true }));
  params.set('timeout', '30000');

  const mode = override?.proxy_mode ?? settings.proxy_mode ?? 'residential';
  if (mode === 'residential') {
    params.set('proxy', 'residential');
    const cc = (override?.country_code || settings.country_code || 'au').toLowerCase();
    if (cc) params.set('proxyCountry', cc);
    const city = override?.proxy_city || settings.proxy_city;
    if (city) params.set('proxyCity', city);
    if (override?.proxy_sticky ?? settings.proxy_sticky ?? true) params.set('proxySticky', 'true');
    if (override?.proxy_locale_match ?? settings.proxy_locale_match ?? true) params.set('proxyLocaleMatch', 'true');
    const preset = override?.proxy_preset || settings.proxy_preset;
    if (preset && preset !== 'none') params.set('proxyPreset', preset);
  }
  return `https://${region}.browserless.io/function?${params.toString()}`;
}

// We try multiple IP info endpoints in order — some block headless / proxied
// traffic, so we need a fallback chain. Each returns slightly different JSON;
// we normalise in the response handler.
const PROBE_SCRIPT = `
export default async ({ page }) => {
  const endpoints = [
    'https://ipinfo.io/json',                 // ip, country, city, org — richest
    'https://ifconfig.co/json',               // ip, country, country_iso, city, asn_org
    'https://api.ipify.org?format=json',     // bare IP — last-resort fallback
  ];
  const started = Date.now();
  let merged = {};
  let lastError = null;
  for (const url of endpoints) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      const text = await page.evaluate(() => document.body.innerText);
      try {
        const j = JSON.parse(text);
        merged = { ...j, ...merged }; // first non-empty wins for shared keys
      } catch (e) { lastError = 'parse: ' + e.message; }
    } catch (e) { lastError = e.message; }
    if (merged.ip) break;
  }
  const elapsed = Date.now() - started;
  return { data: { info: merged, elapsed, lastError }, type: 'application/json' };
};
`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const override = body?.override || null;

    if (!Deno.env.get('BROWSERLESS_TOKEN')) {
      return Response.json({ error: 'BROWSERLESS_TOKEN not set' }, { status: 500 });
    }

    const settingsRows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
    const settings = settingsRows[0] || {};

    const url = buildBrowserlessUrl(settings, override);
    const started = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: PROBE_SCRIPT, context: {} }),
    });
    const totalMs = Date.now() - started;

    if (!res.ok) {
      const text = await res.text();
      return Response.json({
        ok: false,
        browserless_reachable: false,
        error: `Browserless ${res.status}: ${text.slice(0, 300)}`,
        elapsed_ms: totalMs,
      });
    }

    const json = await res.json();
    const payload = json?.data || json;
    const info = payload?.info || {};

    return Response.json({
      ok: true,
      browserless_reachable: true,
      browserless_region: override?.browserless_region || settings.browserless_region || 'production-sfo',
      proxy_mode: override?.proxy_mode ?? settings.proxy_mode ?? 'residential',
      country_requested: (override?.country_code || settings.country_code || 'au').toLowerCase(),
      ip: info.ip || null,
      country: info.country || info.country_iso || info.country_code || null,
      country_name: info.country_name || null,
      city: info.city || null,
      org: info.org || info.asn_org || null,
      asn: info.asn || null,
      probe_elapsed_ms: payload?.elapsed || null,
      total_elapsed_ms: totalMs,
      probe_warning: payload?.lastError || null,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});