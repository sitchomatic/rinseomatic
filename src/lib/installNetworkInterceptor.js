import { pushEntry, updateEntry } from "@/lib/terminalStore";

// Patches window.fetch ONCE so the terminal can show every request the SDK
// makes — both directions. We only capture interesting calls (backend
// functions, entity ops, integrations) to avoid drowning the user in static
// asset noise.

let installed = false;

const INTERESTING = [
  /\/functions\//,
  /\/entities\//,
  /\/integrations\//,
  /\/auth\//,
  /\/agents\//,
];

function isInteresting(url) {
  if (!url) return false;
  return INTERESTING.some((re) => re.test(url));
}

// Try to JSON-stringify a body for display. Falls back to a short text snippet.
async function safeBodyForDisplay(body) {
  if (body == null) return null;
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return body.slice(0, 4000); }
  }
  if (body instanceof FormData) return "[FormData]";
  if (body instanceof Blob) return `[Blob ${body.size}b]`;
  if (body instanceof ArrayBuffer) return `[ArrayBuffer ${body.byteLength}b]`;
  return String(body).slice(0, 4000);
}

async function safeResponseBody(res) {
  // Clone so we don't consume the original — the SDK still needs it.
  try {
    const clone = res.clone();
    const ct = clone.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await clone.json();
    const text = await clone.text();
    return text.length > 4000 ? text.slice(0, 4000) + "…" : text;
  } catch {
    return null;
  }
}

export function installNetworkInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = (init?.method || (typeof input !== "string" && input?.method) || "GET").toUpperCase();
    const interesting = isInteresting(url);

    let entryId = null;
    if (interesting) {
      const reqBody = await safeBodyForDisplay(init?.body);
      const e = pushEntry({
        kind: "req",
        method,
        url,
        body: reqBody,
        pending: true,
      });
      entryId = e?.id || null;
    }

    const start = performance.now();
    try {
      const res = await original(input, init);
      if (entryId) {
        const elapsed = Math.round(performance.now() - start);
        const body = await safeResponseBody(res);
        updateEntry(entryId, { pending: false });
        pushEntry({
          kind: "res",
          method,
          url,
          status: res.status,
          ok: res.ok,
          elapsed_ms: elapsed,
          body,
          parentId: entryId,
        });
      }
      return res;
    } catch (err) {
      if (entryId) {
        const elapsed = Math.round(performance.now() - start);
        updateEntry(entryId, { pending: false });
        pushEntry({
          kind: "res",
          method,
          url,
          status: 0,
          ok: false,
          elapsed_ms: elapsed,
          error: err?.message || String(err),
          parentId: entryId,
        });
      }
      throw err;
    }
  };
}