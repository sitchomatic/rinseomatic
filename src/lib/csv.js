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

export function detectSite(explicitSite, ...args) {
  // Last arg may be the runtime sites list; older callers pass only hint strings.
  const maybeSites = args[args.length - 1];
  const sites = Array.isArray(maybeSites) ? maybeSites : [];
  const hints = (Array.isArray(maybeSites) ? args.slice(0, -1) : args).filter(Boolean);

  const explicit = (explicitSite || "").trim().toLowerCase();
  const validKey = (k) => sites.length === 0 || sites.some((s) => s.key === k);

  // Exact match against a known site key
  if (explicit && validKey(explicit)) {
    if (sites.some((s) => s.key === explicit)) return explicit;
    if (FALLBACK_HINTS[explicit]) return explicit;
  }

  const hay = [explicit, ...hints].join(" ").toLowerCase();
  if (!hay.trim()) return null;

  // Match by site label or key fragment from runtime sites
  for (const s of sites) {
    const k = (s.key || "").toLowerCase();
    const l = (s.label || "").toLowerCase();
    if (k && hay.includes(k)) return s.key;
    if (l && hay.includes(l)) return s.key;
  }

  // Built-in fallback for the original four sites
  for (const [key, needles] of Object.entries(FALLBACK_HINTS)) {
    if (needles.some((n) => hay.includes(n))) return key;
  }
  return null;
}