// Tiny cross-tab leader election keyed on a run id.
// Tabs renew a heartbeat every `intervalMs`; if the current leader stops
// renewing for `staleMs`, another tab takes over. Avoids two tabs polling
// the same run's worker simultaneously and double-claiming queued results.
//
// Uses localStorage + the `storage` event (no shared workers / no service
// workers — works in plain Vite dev).

const KEY_PREFIX = "credtester:runlead:";

export function startRunLeader(runId, { intervalMs = 1500, staleMs = 5000 } = {}) {
  if (typeof window === "undefined" || !runId) {
    return { isLeader: () => true, stop: () => {} };
  }
  const key = KEY_PREFIX + runId;
  const me = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let stopped = false;
  let leader = false;
  let timer = null;

  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const write = (entry) => {
    try { localStorage.setItem(key, JSON.stringify(entry)); } catch {}
  };
  const clear = () => {
    try { localStorage.removeItem(key); } catch {}
  };

  const tick = () => {
    if (stopped) return;
    const now = Date.now();
    const cur = read();
    if (!cur || now - (cur.ts || 0) > staleMs) {
      // No leader, or stale → become leader
      write({ id: me, ts: now });
      leader = true;
    } else if (cur.id === me) {
      // Renew
      write({ id: me, ts: now });
      leader = true;
    } else {
      leader = false;
    }
    timer = setTimeout(tick, intervalMs);
  };

  // If another tab takes over, react fast
  const onStorage = (e) => {
    if (e.key !== key) return;
    const cur = read();
    leader = !!cur && cur.id === me;
  };
  window.addEventListener("storage", onStorage);
  tick();

  return {
    isLeader: () => leader,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      const cur = read();
      if (cur && cur.id === me) clear();
    },
  };
}