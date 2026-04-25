import { base44 } from "@/api/base44Client";
import { pushEntry } from "@/lib/terminalStore";

// Forwards live ActionLog rows into the terminal store as kind:"log" entries.
// Idempotent — safe to call multiple times.

let started = false;
let unsub = null;

export function startLogStreamer() {
  if (started) return;
  started = true;
  try {
    unsub = base44.entities.ActionLog.subscribe((event) => {
      if (event.type !== "create" || !event.data) return;
      const l = event.data;
      pushEntry({
        kind: "log",
        level: l.level || "info",
        category: l.category || "system",
        site: l.site,
        message: l.message,
        delta_ms: l.delta_ms || 0,
        log_id: l.id,
      });
    });
  } catch {
    started = false;
  }
}

export function stopLogStreamer() {
  if (unsub) { unsub(); unsub = null; }
  started = false;
}