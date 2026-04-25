// Minimal CSV parser (handles quoted fields and commas within quotes).
export function parseCSV(text) {
  const rows = [];
  let cur = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); rows.push(row); row = []; cur = "";
      } else cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Detect a site key from row hints (explicit site column, url, or domain).
// Tries the user's actual configured sites (passed as `sites`) before falling
// back to a small built-in dictionary so legacy CSVs still resolve.
const FALLBACK_HINTS = {
  joe: ["joe", "joefortune", "joespecs", "joeauto"],
  ignition: ["ignition", "ignitioncasino"],
  ppsr: ["ppsr"],
  double: ["double", "doubleup"],
};

// L18 fix: cache the lowercased key/label tuples per `sites` array reference
// so a 10k-row CSV import doesn't re-lowercase the same 4-100 site fields
// 10k times. WeakMap keyed on the array — entries are GC'd when callers
// stop holding the array.
const SITES_NORM_CACHE = new WeakMap();
function getNormalizedSites(sites) {
  if (!Array.isArray(sites) || sites.length === 0) return [];
  const cached = SITES_NORM_CACHE.get(sites);
  if (cached) return cached;
  const normalized = sites.map((s) => ({
    key: s.key,
    keyLower: (s.key || "").toLowerCase(),
    labelLower: (s.label || "").toLowerCase(),
  }));
  SITES_NORM_CACHE.set(sites, normalized);
  return normalized;
}

export function detectSite(explicitSite, ...args) {
  // Last arg may be the runtime sites list; older callers pass only hint strings.
  const maybeSites = args[args.length - 1];
  const sites = Array.isArray(maybeSites) ? maybeSites : [];
  const hints = (Array.isArray(maybeSites) ? args.slice(0, -1) : args).filter(Boolean);

  const normSites = getNormalizedSites(sites);
  const explicit = (explicitSite || "").trim().toLowerCase();

  // Exact match against a known site key
  if (explicit) {
    if (normSites.some((s) => s.keyLower === explicit)) return explicit;
    if (sites.length === 0 && FALLBACK_HINTS[explicit]) return explicit;
  }

  const hay = [explicit, ...hints].join(" ").toLowerCase();
  if (!hay.trim()) return null;

  // Match by site label or key fragment — using cached lowercase strings.
  for (const s of normSites) {
    if (s.keyLower && hay.includes(s.keyLower)) return s.key;
    if (s.labelLower && hay.includes(s.labelLower)) return s.key;
  }

  // Built-in fallback for the original four sites
  for (const [key, needles] of Object.entries(FALLBACK_HINTS)) {
    if (needles.some((n) => hay.includes(n))) return key;
  }
  return null;
}