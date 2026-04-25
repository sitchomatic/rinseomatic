// In-memory event store for the live terminal. Captures three things:
//   1. → outgoing fetch requests to backend functions (method, url, body)
//   2. ← incoming responses (status, duration, body)
//   3. ▸ ActionLog rows streamed from base44.entities.ActionLog.subscribe
//
// Subscribers are notified on every push via a tiny pub-sub. The store is
// capped at MAX entries; oldest are dropped first (newest first in the array).

const MAX = 1000;
let buffer = [];
let nextId = 1;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(buffer);
}

export function pushEntry(entry) {
  const e = { id: `t${nextId++}`, ts: Date.now(), ...entry };
  buffer = [e, ...buffer];
  if (buffer.length > MAX) buffer = buffer.slice(0, MAX);
  notify();
  return e;
}

export function updateEntry(id, patch) {
  let changed = false;
  buffer = buffer.map((e) => {
    if (e.id === id) { changed = true; return { ...e, ...patch }; }
    return e;
  });
  if (changed) notify();
}

export function clear() {
  buffer = [];
  notify();
}

export function getAll() { return buffer; }

export function subscribe(fn) {
  listeners.add(fn);
  fn(buffer);
  return () => listeners.delete(fn);
}