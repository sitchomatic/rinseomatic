import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SCRAPINGBEE_URL = 'https://app.scrapingbee.com/api/v1/';
const DEFAULT_SUCCESS_SELECTOR = '.ol-alert__content.ol-alert__content--status_success';
const BLOCK_MARKERS = ['/blocked', '/error', '/access-denied', '/forbidden', '/captcha', '/challenge'];

function buildScenario(site, username, password) {
  const waitMs = site.wait_after_submit_ms || 3500;
  return {
    instructions: [
      { wait_for: site.username_selector || "input[type='email'], input[name='username']" },
      { fill: [site.username_selector || "input[type='email'], input[name='username']", username] },
      { fill: [site.password_selector || "input[type='password']", password] },
      { click: site.submit_selector || "button[type='submit']" },
      { wait: waitMs },
      {
        evaluate: `(() => {
          const sel = ${JSON.stringify(site.success_selector || DEFAULT_SUCCESS_SELECTOR)};
          const el = document.querySelector(sel);
          const marker = !!el && (el.offsetParent !== null || (el.getBoundingClientRect && el.getBoundingClientRect().height > 0));
          window.__marker = marker;
          window.__finalUrl = location.href;
        })()`,
      },
    ],
  };
}

function classify(site, finalUrl, markerFound) {
  const loginMarker = site.login_url_marker || '/login';
  const successUrlContains = site.success_url_contains;
  const url = (finalUrl || '').toLowerCase();
  const hitBlock = BLOCK_MARKERS.some((m) => url.includes(m));
  if (hitBlock && !markerFound) return 'failed';
  const urlOkByMarker = loginMarker ? !url.includes(loginMarker) : true;
  const urlOkByContains = successUrlContains ? url.includes(successUrlContains.toLowerCase()) : true;
  const urlChanged = urlOkByMarker && urlOkByContains;
  if (urlChanged || markerFound) return 'working';
  return 'failed';
}

async function runSingleTest(site, apiKey, username, password) {
  if (!site.login_url) {
    return { site_key: site.key, status: 'error', error_message: `Site ${site.key} has no login_url`, elapsed_ms: 0 };
  }
  const scenario = buildScenario(site, username, password);
  const params = new URLSearchParams({
    api_key: apiKey,
    url: site.login_url,
    render_js: 'true',
    stealth_proxy: 'true',
    block_resources: 'false',
    return_page_source: 'true',
    js_scenario: JSON.stringify(scenario),
  });

  const started = Date.now();
  const sbRes = await fetch(`${SCRAPINGBEE_URL}?${params.toString()}`);
  const elapsed = Date.now() - started;

  if (!sbRes.ok) {
    const text = await sbRes.text();
    return { site_key: site.key, status: 'error', error_message: `ScrapingBee ${sbRes.status}: ${text.slice(0, 300)}`, elapsed_ms: elapsed };
  }

  const resolvedUrl = sbRes.headers.get('Spb-Resolved-Url') || sbRes.headers.get('spb-resolved-url') || site.login_url;
  const html = await sbRes.text();
  const markerMatch = html.match(/window\.__marker\s*=\s*(true|false)/);
  const urlMatch = html.match(/window\.__finalUrl\s*=\s*"([^"]+)"/);
  const markerFound = markerMatch ? markerMatch[1] === 'true' : false;
  const finalUrl = urlMatch ? urlMatch[1] : resolvedUrl;

  const successSel = site.success_selector || DEFAULT_SUCCESS_SELECTOR;
  const domHasMarker = successSel.split(',').some((s) => {
    const cls = s.trim().replace(/^\./, '').replace(/\./g, ' ');
    return html.includes(`class="${cls}"`) || html.includes(cls);
  });

  const effectiveMarker = markerFound || domHasMarker;
  const status = classify(site, finalUrl, effectiveMarker);

  return {
    site_key: site.key,
    status,
    final_url: finalUrl,
    success_marker_found: effectiveMarker,
    elapsed_ms: elapsed,
  };
}

function combine(perSite) {
  // working if any site is working; else failed if any failed; else error
  const anyWorking = perSite.find((r) => r.status === 'working');
  if (anyWorking) {
    return {
      status: 'working',
      final_url: anyWorking.final_url,
      success_marker_found: true,
      elapsed_ms: perSite.reduce((a, b) => a + (b.elapsed_ms || 0), 0),
      per_site: perSite,
    };
  }
  const anyFailed = perSite.find((r) => r.status === 'failed');
  if (anyFailed) {
    return {
      status: 'failed',
      final_url: anyFailed.final_url,
      success_marker_found: false,
      elapsed_ms: perSite.reduce((a, b) => a + (b.elapsed_ms || 0), 0),
      per_site: perSite,
    };
  }
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

    const { username, password, site_key } = await req.json();
    if (!username || !password || !site_key) {
      return Response.json({ error: 'Missing username/password/site_key' }, { status: 400 });
    }

    const apiKey = Deno.env.get('SCRAPINGBEE_API_KEY');
    if (!apiKey) return Response.json({ error: 'SCRAPINGBEE_API_KEY not set' }, { status: 500 });

    const sites = await base44.asServiceRole.entities.Site.filter({ key: site_key });
    const site = sites[0];
    if (!site) return Response.json({ error: `Unknown site: ${site_key}` }, { status: 404 });

    // Build the list of sites to test
    const testSites = [];
    if (!site.skip_primary && site.login_url) testSites.push(site);

    const secondaryKeys = Array.isArray(site.secondary_site_keys) ? site.secondary_site_keys : [];
    for (const k of secondaryKeys) {
      const found = await base44.asServiceRole.entities.Site.filter({ key: k });
      if (found[0]) testSites.push(found[0]);
    }

    if (testSites.length === 0) {
      return Response.json({ status: 'error', error_message: `No testable sites for ${site_key}` });
    }

    // Sequential execution (ScrapingBee calls are expensive; keep it simple)
    const results = [];
    for (const s of testSites) {
      results.push(await runSingleTest(s, apiKey, username, password));
    }

    if (results.length === 1) {
      const r = results[0];
      return Response.json({
        status: r.status,
        final_url: r.final_url,
        success_marker_found: r.success_marker_found,
        error_message: r.error_message,
        elapsed_ms: r.elapsed_ms,
      });
    }

    return Response.json(combine(results));
  } catch (error) {
    return Response.json({ status: 'error', error_message: error.message }, { status: 500 });
  }
});