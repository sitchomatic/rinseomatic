import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import StatusPill from "@/components/shared/StatusPill";
import SiteChip from "@/components/shared/SiteChip";
import { formatMs } from "@/lib/sites";
import { runEta, formatEta } from "@/lib/eta";

export default function RunCard({ run, siteLabel }) {
  const pct = run.total_count ? Math.round(((run.total_count - (run.pending_count || 0)) / run.total_count) * 100) : 0;
  const eta = runEta(run);
  const etaLabel = eta ? formatEta(eta.remainingMs) : null;
  return (
    <Link to={`/runs/${run.id}`} className="block rounded-xl border border-border bg-card hover:border-primary/40 transition-colors p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{run.label || "Untitled run"}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
            {run.started_at ? format(new Date(run.started_at), "MMM d HH:mm") : "—"} · {formatMs(run.elapsed_ms)}
            {etaLabel && <span className="text-primary/80"> · ~{etaLabel} left</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SiteChip siteKey={run.site_key} label={siteLabel} size="sm" />
          <StatusPill status={run.status} />
        </div>
      </div>

      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
        <span>{run.total_count - (run.pending_count || 0)}/{run.total_count}</span>
        <span className="flex items-center gap-3">
          <span className="text-emerald-300">{run.working_count || 0} ok</span>
          <span className="text-rose-300">{run.failed_count || 0} fail</span>
          {run.error_count ? <span className="text-amber-300">{run.error_count} err</span> : null}
        </span>
      </div>
    </Link>
  );
}