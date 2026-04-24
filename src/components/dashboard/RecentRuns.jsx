import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import StatusPill from "@/components/shared/StatusPill";
import SiteChip from "@/components/shared/SiteChip";
import { formatMs } from "@/lib/sites";
import { ArrowRight } from "lucide-react";

export default function RecentRuns({ runs, sites }) {
  const siteLabel = (k) => sites.find((s) => s.key === k)?.label || k;

  if (!runs || runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 py-10 text-center text-sm text-muted-foreground">
        No runs yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/40 flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Recent runs</div>
        <Link to="/runs" className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          view all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="divide-y divide-border/60">
        {runs.slice(0, 6).map((r) => (
          <Link
            key={r.id}
            to={`/runs/${r.id}`}
            className="grid grid-cols-[minmax(0,2fr)_110px_100px_110px_90px] gap-3 px-4 py-2.5 items-center text-xs hover:bg-secondary/30 transition-colors"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{r.label || "Untitled run"}</div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {r.started_at ? format(new Date(r.started_at), "MMM d HH:mm") : "—"}
              </div>
            </div>
            <SiteChip siteKey={r.site_key} label={siteLabel(r.site_key)} size="sm" />
            <StatusPill status={r.status} />
            <div className="font-mono text-muted-foreground">
              <span className="text-emerald-300">{r.working_count || 0}</span>
              <span className="mx-1">·</span>
              <span className="text-rose-300">{r.failed_count || 0}</span>
            </div>
            <div className="font-mono text-muted-foreground text-right">{formatMs(r.elapsed_ms)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}