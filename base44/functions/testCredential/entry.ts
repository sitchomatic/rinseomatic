import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SCRAPINGBEE_URL = 'https://app.scrapingbee.com/api/v1/';
const DEFAULT_SUCCESS_SELECTOR = '.ol-alert__content.ol-alert__content--status_success';

function buildScenario(site, username, password) {
  const waitMs = site.wait_after_submit_ms || 3500;
  const steps = [
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
  ];
  return { instructions: steps };
}

function classify(site, finalUrl, markerFound) {
  const loginMarker = site.login_url_marker || '/login';
  const successUrlContains = site.success_url_contains;

  const urlOkByMarker = loginMarker ? !finalUrl.includes(loginMarker) : true;
  const urlOkByContains = successUrlContains ? finalUrl.includes(successUrlContains) : true;
  const urlChanged = urlOkByMarker && urlOkByContains;

  // Success = URL changed away from login OR success alert detected
  if (urlChanged || markerFound) return 'working';
  return 'failed';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { username, password, site_key } = body;
    if (!username || !password || !site_key) {
      return Response.json({ error: 'Missing username/password/site_key' }, { status: 400 });
    }

    const sites = await base44.asServiceRole.entities.Site.filter({ key: site_key });
    const site = sites[0];
    if (!site) return Response.json({ error: `Unknown site: ${site_key}` }, { status: 404 });

    const apiKey = Deno.env.get('SCRAPINGBEE_API_KEY');
    if (!apiKey) return Response.json({ error: 'SCRAPINGBEE_API_KEY not set' }, { status: 500 });

    const scenario = buildScenario(site, username, password);

    const params = new URLSearchParams({
      api_key: apiKey,
      url: site.login_url,
      render_js: 'true',
      premium_proxy: 'true',
      return_page_source: 'true',
      js_scenario: JSON.stringify(scenario),
    });

    const started = Date.now();
    const sbRes = await fetch(`${SCRAPINGBEE_URL}?${params.toString()}`);
    const elapsed = Date.now() - started;

    if (!sbRes.ok) {
      const text = await sbRes.text();
      return Response.json({
        status: 'error',
        error_message: `ScrapingBee ${sbRes.status}: ${text.slice(0, 300)}`,
        elapsed_ms: elapsed,
      });
    }

    // Parse resolved URL + evaluated marker from the response headers
    const resolvedUrl = sbRes.headers.get('Spb-Resolved-Url') || sbRes.headers.get('spb-resolved-url') || site.login_url;
    const evalResults = sbRes.headers.get('Spb-Js-Scenario-Report') || sbRes.headers.get('spb-js-scenario-report');

    // Parse final URL and marker out of the HTML as fallback (we injected window.__marker / __finalUrl)
    const html = await sbRes.text();
    const markerMatch = html.match(/window\.__marker\s*=\s*(true|false)/);
    const urlMatch = html.match(/window\.__finalUrl\s*=\s*"([^"]+)"/);
    const markerFound = markerMatch ? markerMatch[1] === 'true' : false;
    const finalUrl = urlMatch ? urlMatch[1] : resolvedUrl;

    // Better: check live DOM for success selector in returned HTML
    const successSel = site.success_selector || DEFAULT_SUCCESS_SELECTOR;
    const domHasMarker = successSel.split(',').some((s) => {
      const cls = s.trim().replace(/^\./, '').replace(/\./g, ' ');
      return html.includes(`class="${cls}"`) || html.includes(cls);
    });

    const effectiveMarker = markerFound || domHasMarker;
    const status = classify(site, finalUrl, effectiveMarker);

    return Response.json({
      status,
      final_url: finalUrl,
      success_marker_found: effectiveMarker,
      elapsed_ms: elapsed,
      scenario_report: evalResults || null,
    });
  } catch (error) {
    return Response.json({ status: 'error', error_message: error.message }, { status: 500 });
  }
});