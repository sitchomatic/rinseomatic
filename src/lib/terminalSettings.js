const KEY = "credential-tester-terminal-settings";

const DEFAULTS = {
  captureFetch: true,
  captureSockets: true,
  captureActionLogs: true,
  showPayloads: true,
  openOnError: false,
};

let cache = null;
const listeners = new Set();

function readStorage() {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

function writeStorage(value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(value));
}

export function getTerminalSettings() {
  if (!cache) cache = readStorage();
  return cache;
}

export function updateTerminalSettings(patch) {
  cache = { ...getTerminalSettings(), ...patch };
  writeStorage(cache);
  for (const fn of listeners) fn(cache);
  return cache;
}

export function subscribeTerminalSettings(fn) {
  listeners.add(fn);
  fn(getTerminalSettings());
  return () => listeners.delete(fn);
}

export { DEFAULTS as defaultTerminalSettings };