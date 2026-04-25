// Builds a clean, sorted CSV report of the current credential vault.
// Grouped by site, with summary header rows showing per-site success rates.

import { toCsv } from "@/lib/download";

export function buildCredentialReport(credentials, sites) {
  const siteByKey = new Map((sites || []).map((s) => [s.key, s]));

  // Bucket credentials by site_key (single pass).
  const buckets = new Map();
  for (const c of credentials || []) {
    const key = c.site_key || "unknown";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }

  const rows = [];
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) =>
    (siteByKey.get(a)?.label || a).localeCompare(siteByKey.get(b)?.label || b)
  );

  for (const key of sortedKeys) {
    const list = buckets.get(key);
    const site = siteByKey.get(key);
    const total = list.length;
    const working = list.filter((c) => c.status === "working").length;
    const failed = list.filter((c) => c.status === "failed").length;
    const errored = list.filter((c) => c.status === "error").length;
    const untested = total - working - failed - errored;
    const pct = total ? Math.round((working / total) * 100) : 0;

    rows.push({
      site: site?.label || key,
      site_key: key,
      username: `— ${total} credentials · ${working} working (${pct}%) · ${failed} failed · ${errored} errored · ${untested} untested —`,
      status: "summary",
      last_tested: "",
      attempts: "",
      working_password: "",
      notes: "",
    });

    const sorted = [...list].sort((a, b) => (a.username || "").localeCompare(b.username || ""));
    for (const c of sorted) {
      rows.push({
        site: site?.label || key,
        site_key: key,
        username: c.username || "",
        status: c.status || "untested",
        last_tested: c.last_tested || "",
        attempts: c.attempts || 0,
        working_password: c.working_password ? "yes" : "",
        notes: c.last_result_note || "",
      });
    }
  }

  const csv = toCsv(rows, [
    { label: "Site", key: "site" },
    { label: "Site Key", key: "site_key" },
    { label: "Username", key: "username" },
    { label: "Status", key: "status" },
    { label: "Last Tested", key: "last_tested" },
    { label: "Attempts", key: "attempts" },
    { label: "Has Working Password", key: "working_password" },
    { label: "Notes", key: "notes" },
  ]);

  // Prepend a one-line header comment with totals + generation timestamp.
  const total = credentials?.length || 0;
  const working = (credentials || []).filter((c) => c.status === "working").length;
  const overallPct = total ? Math.round((working / total) * 100) : 0;
  const header = `# Credential Vault Report · ${new Date().toISOString()} · ${total} credentials · ${working} working (${overallPct}%)\n`;
  return header + csv;
}