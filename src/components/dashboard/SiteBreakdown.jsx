import React from "react";
import SiteChip from "@/components/shared/SiteChip";

// Per-site totals across all runs in scope. Sorted by working desc.
export default function SiteBreakdown({ runs, sites }) {
  const rows = React.useMemo(() => {
    const map = new Map();
    for (const r of runs) {
      const k = r.site_key;
      if (!k) continue;
      const cur = map.get(k) || { site_key: k, working: 0, failed: 0, error: 0, runs: 0 };
      cur.working += r.working_count || 0;
      cur.failed += r.failed_count || 0;
      cur.error += r.error_count || 0;
      cur.runs += 1;
      map.set(k, cur);
    }
    const siteLabel = (k) => sites.find((s) => s.key === k)?.label || k;
    return [...map.values()]
      .map((r) => ({ ...r, label: siteLabel(r.site_key), total: r.working + r.failed + r.error }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.working - a.working || b.total - a.total);
  }, [runs, sites]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-xs text-muted-foreground text-center">
        No site activity yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">By site</div>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const wPct = r.total ? (r.working / r.total) * 100 : 0;
          const fPct = r.total ? (r.failed / r.total) * 100 : 0;
          const ePct = r.total ? (r.error / r.total) * 100 : 0;
          return (
            <div key={r.site_key} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <SiteChip siteKey={r.site_key} label={r.label} size="sm" />
                  <span className="text-[10px] font-mono text-muted-foreground">{r.runs} run{r.runs === 1 ? "" : "s"}</span>
                </div>
                <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                  <span className="text-emerald-300">{r.working}</span>
                  <span className="text-rose-300">{r.failed}</span>
                  <span className="text-amber-300">{r.error}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden flex">
                <div className="h-full bg-emerald-500/80" style={{ width: `${wPct}%` }} />
                <div className="h-full bg-rose-500/80" style={{ width: `${fPct}%` }} />
                <div className="h-full bg-amber-500/80" style={{ width: `${ePct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}