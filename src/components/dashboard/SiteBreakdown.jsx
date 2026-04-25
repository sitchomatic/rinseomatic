import React from "react";
import SiteChip from "@/components/shared/SiteChip";
import { cn } from "@/lib/utils";

export default function SiteBreakdown({ sites, credentials }) {
  // L11 fix: single-pass tally bucketed by site_key. Was O(sites × creds × 4)
  // — for 4 sites × 10k creds that's 160k checks per render. Now 10k.
  const rows = React.useMemo(() => {
    const tally = new Map(); // site_key → counters
    for (const s of sites || []) tally.set(s.key, { site: s, total: 0, working: 0, failed: 0, error: 0, untested: 0 });
    for (const c of credentials || []) {
      const t = tally.get(c.site_key);
      if (!t) continue; // credential references a deleted site — skip
      t.total++;
      if (c.status === "working") t.working++;
      else if (c.status === "failed") t.failed++;
      else if (c.status === "error") t.error++;
      else t.untested++;
    }
    const arr = Array.from(tally.values());
    for (const r of arr) r.pct = r.total ? Math.round((r.working / r.total) * 100) : 0;
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [sites, credentials]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 py-10 text-center text-sm text-muted-foreground">
        No sites configured yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-secondary/40">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">By site</div>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((r) => (
          <div key={r.site.key} className="px-5 py-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <SiteChip siteKey={r.site.key} label={r.site.label} size="sm" />
              <div className="text-xs font-mono text-muted-foreground">
                <span className="text-foreground font-semibold">{r.working}</span>/{r.total} working · <span className="tabular-nums">{r.pct}%</span>
              </div>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden flex">
              <Bar value={r.working} total={r.total} className="bg-emerald-400" />
              <Bar value={r.failed} total={r.total} className="bg-rose-400" />
              <Bar value={r.error} total={r.total} className="bg-amber-400" />
              <Bar value={r.untested} total={r.total} className="bg-muted-foreground/40" />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[10px] font-mono text-muted-foreground">
              <Legend color="bg-emerald-400" label={`${r.working} ok`} />
              <Legend color="bg-rose-400" label={`${r.failed} fail`} />
              {r.error > 0 && <Legend color="bg-amber-400" label={`${r.error} err`} />}
              {r.untested > 0 && <Legend color="bg-muted-foreground/40" label={`${r.untested} untested`} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ value, total, className }) {
  if (!total || !value) return null;
  const pct = (value / total) * 100;
  return <div className={cn("h-full", className)} style={{ width: `${pct}%` }} />;
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      {label}
    </span>
  );
}