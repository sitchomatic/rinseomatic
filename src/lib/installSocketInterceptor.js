import { pushEntry } from "@/lib/terminalStore";

// Patches WebSocket and EventSource so the terminal can show real-time
// subscription frames (entity .subscribe() etc.) — those use long-lived
// sockets, NOT fetch, so the network interceptor misses them.
//
// We only log open/close/error + a short text preview of incoming messages.
// Bodies can be large (full entity rows on every change), so we cap to 600
// chars per frame.

let installed = false;

const INTERESTING_HOST = /base44|websocket|realtime|stream/i;

function shortFrame(data) {
  if (data == null) return "";
  if (typeof data === "string") return data.length > 600 ? data.slice(0, 600) + "…" : data;
  if (data instanceof Blob) return `[Blob ${data.size}b]`;
  if (data instanceof ArrayBuffer) return `[ArrayBuffer ${data.byteLength}b]`;
  return String(data).slice(0, 600);
}

function tryParse(s) {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
}

export function installSocketInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // ---------- WebSocket ----------
  const OriginalWS = window.WebSocket;
  if (OriginalWS) {
    function PatchedWS(url, protocols) {
      const ws = protocols ? new OriginalWS(url, protocols) : new OriginalWS(url);
      const interesting = INTERESTING_HOST.test(String(url));
      if (interesting) {
        pushEntry({ kind: "ws", phase: "open", url: String(url) });
        ws.addEventListener("message", (ev) => {
          pushEntry({
            kind: "ws", phase: "msg", url: String(url),
            body: tryParse(shortFrame(ev.data)),
          });
        });
        ws.addEventListener("close", (ev) => {
          pushEntry({
            kind: "ws", phase: "close", url: String(url),
            body: { code: ev.code, reason: ev.reason || null },
          });
        });
        ws.addEventListener("error", () => {
          pushEntry({ kind: "ws", phase: "error", url: String(url) });
        });
      }
      return ws;
    }
    PatchedWS.prototype = OriginalWS.prototype;
    PatchedWS.CONNECTING = OriginalWS.CONNECTING;
    PatchedWS.OPEN = OriginalWS.OPEN;
    PatchedWS.CLOSING = OriginalWS.CLOSING;
    PatchedWS.CLOSED = OriginalWS.CLOSED;
    window.WebSocket = PatchedWS;
  }

  // ---------- EventSource (SSE) ----------
  const OriginalES = window.EventSource;
  if (OriginalES) {
    function PatchedES(url, init) {
      const es = init ? new OriginalES(url, init) : new OriginalES(url);
      const interesting = INTERESTING_HOST.test(String(url));
      if (interesting) {
        pushEntry({ kind: "sse", phase: "open", url: String(url) });
        es.addEventListener("message", (ev) => {
          pushEntry({
            kind: "sse", phase: "msg", url: String(url),
            body: tryParse(shortFrame(ev.data)),
          });
        });
        es.addEventListener("error", () => {
          pushEntry({ kind: "sse", phase: "error", url: String(url) });
        });
      }
      return es;
    }
    PatchedES.prototype = OriginalES.prototype;
    PatchedES.CONNECTING = OriginalES.CONNECTING;
    PatchedES.OPEN = OriginalES.OPEN;
    PatchedES.CLOSED = OriginalES.CLOSED;
    window.EventSource = PatchedES;
  }
}