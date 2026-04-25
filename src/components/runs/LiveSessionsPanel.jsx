import React from "react";
import { ExternalLink, Eye } from "lucide-react";
import { formatMs } from "@/lib/sites";

// Shows currently-running rows with their Browserless live-view URLs so the
// user can click into any active session and watch it in real time.
export default function LiveSessionsPanel({ results }) {
  const live = React.useMemo(
    () => (results || []).filter((r) => r.status === "running" && r.live_url),
    [results]
  );

  if (live.length === 0) return null;

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="h-3.5 w-3.5 text-sky-300" />
        <div className="text-xs font-mono uppercase tracking-wider text-sky-300">Live sessions · {live.length}</div>
        <div className="text-[11px] text-muted-foreground">Click any row to watch the browser in real time.</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {live.slice(0, 8).map((r) => (
          <a
            key={r.id}
            href={r.live_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-md border border-sky-500/20 bg-background/40 hover:bg-background/80 hover:border-sky-500/40 transition-colors px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="font-mono truncate">{r.username}</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                attempt {r.attempts || 1} · {formatMs(r.elapsed_ms || 0)}
              </div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-sky-300 shrink-0" />
          </a>
        ))}
      </div>
      {live.length > 8 && (
        <div className="text-[10px] text-muted-foreground text-center mt-2 font-mono">
          + {live.length - 8} more running
        </div>
      )}
    </div>
  );
}