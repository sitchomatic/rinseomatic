import React from "react";
import SiteChip from "@/components/shared/SiteChip";
import { cn } from "@/lib/utils";

export default function SiteBreakdown({ sites, credentials }) {
  const rows = (sites || []).map((s) => {
    const items = credentials.filter((c) => c.site_key === s.key);
    const total = items.length;
    const working = items.filter((c) => c.status === "working").length;
    const failed = items.filter((c) => c.status === "failed").length;
    const error = items.filter((c) => c.status === "error").length;
    const untested = items.filter((c) => !c.status || c.status === "untested").length;
    const pct = total ? Math.round((working / total) * 100) : 0;
    return { site: s, total, working, failed, error, untested, pct };
  }).sort((a, b) => b.total - a.total);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 py-10 text-center text-sm text-muted-foreground">
        No sites configured yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/40">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">By site</div>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((r) => (
          <div key={r.site.key} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <SiteChip siteKey={r.site.key} label={r.site.label} size="sm" />
              <div className="text-xs font-mono text-muted-foreground">
                <span className="text-foreground font-semibold">{r.working}</span>/{r.total} working · <span className="tabular-nums">{r.pct}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden flex">
              <Bar value={r.working} total={r.total} className="bg-emerald-400" />
              <Bar value={r.failed} total={r.total} className="bg-rose-400" />
              <Bar value={r.error} total={r.total} className="bg-amber-400" />
              <Bar value={r.untested} total={r.total} className="bg-muted-foreground/40" />
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
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