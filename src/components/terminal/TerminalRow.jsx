import React from "react";
import { format } from "date-fns";
import { ArrowRight, ArrowLeft, Activity, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Trim verbose URL prefix so rows fit. Keeps the path + last segment readable.
function shortUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

const LEVEL_TONE = {
  success: "text-emerald-300",
  error: "text-rose-300",
  warn: "text-amber-300",
  info: "text-sky-300",
  debug: "text-muted-foreground",
};

function formatBody(body) {
  if (body == null) return null;
  if (typeof body === "string") return body;
  try { return JSON.stringify(body, null, 2); } catch { return String(body); }
}

export default function TerminalRow({ entry }) {
  const [open, setOpen] = React.useState(false);
  const ts = format(new Date(entry.ts), "HH:mm:ss.SSS");

  // --- request ---
  if (entry.kind === "req") {
    const expandable = entry.body != null;
    return (
      <div className="border-l-2 border-sky-500/40">
        <button
          type="button"
          onClick={() => expandable && setOpen((v) => !v)}
          className={cn(
            "w-full text-left grid grid-cols-[80px_16px_16px_44px_1fr_60px] gap-2 px-3 py-1 items-center hover:bg-secondary/30",
            !expandable && "cursor-default"
          )}
        >
          <span className="text-muted-foreground tabular-nums text-[10px]">{ts}</span>
          {expandable ? (
            <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-90")} />
          ) : <span />}
          <ArrowRight className="h-3 w-3 text-sky-400" />
          <span className="text-sky-300 font-semibold text-[10px] uppercase">{entry.method}</span>
          <span className="truncate text-foreground/90" title={entry.url}>{shortUrl(entry.url)}</span>
          <span className="text-[10px] text-muted-foreground text-right">{entry.pending ? "…" : ""}</span>
        </button>
        {open && expandable && (
          <pre className="ml-[112px] mr-3 mb-1 text-[10px] bg-secondary/40 border border-border/60 rounded p-2 overflow-x-auto thin-scroll text-muted-foreground whitespace-pre-wrap break-all">
{formatBody(entry.body)}
          </pre>
        )}
      </div>
    );
  }

  // --- response ---
  if (entry.kind === "res") {
    const tone = entry.ok ? "text-emerald-300" : "text-rose-300";
    const arrowTone = entry.ok ? "text-emerald-400" : "text-rose-400";
    const borderTone = entry.ok ? "border-emerald-500/40" : "border-rose-500/40";
    const expandable = entry.body != null || entry.error;
    return (
      <div className={cn("border-l-2", borderTone)}>
        <button
          type="button"
          onClick={() => expandable && setOpen((v) => !v)}
          className={cn(
            "w-full text-left grid grid-cols-[80px_16px_16px_44px_1fr_60px] gap-2 px-3 py-1 items-center hover:bg-secondary/30",
            !expandable && "cursor-default"
          )}
        >
          <span className="text-muted-foreground tabular-nums text-[10px]">{ts}</span>
          {expandable ? (
            <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-90")} />
          ) : <span />}
          <ArrowLeft className={cn("h-3 w-3", arrowTone)} />
          <span className={cn("font-semibold text-[10px] tabular-nums", tone)}>{entry.status || "ERR"}</span>
          <span className="truncate text-foreground/90" title={entry.url}>
            {shortUrl(entry.url)}
            {entry.error && <span className="text-rose-300 ml-2">· {entry.error}</span>}
          </span>
          <span className="text-[10px] text-muted-foreground text-right tabular-nums">{entry.elapsed_ms}ms</span>
        </button>
        {open && expandable && (
          <pre className="ml-[112px] mr-3 mb-1 text-[10px] bg-secondary/40 border border-border/60 rounded p-2 overflow-x-auto thin-scroll text-muted-foreground whitespace-pre-wrap break-all">
{formatBody(entry.body) || entry.error}
          </pre>
        )}
      </div>
    );
  }

  // --- ActionLog ---
  if (entry.kind === "log") {
    const tone = LEVEL_TONE[entry.level] || LEVEL_TONE.info;
    return (
      <div className="border-l-2 border-border">
        <div className="grid grid-cols-[80px_16px_16px_44px_1fr_60px] gap-2 px-3 py-1 items-center">
          <span className="text-muted-foreground tabular-nums text-[10px]">{ts}</span>
          <span />
          <Activity className={cn("h-3 w-3", tone)} />
          <span className={cn("text-[10px] uppercase tracking-wider truncate", tone)}>{entry.category}</span>
          <span className="truncate text-foreground/90 flex items-center gap-2 min-w-0" title={entry.message}>
            {entry.site && (
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1">{entry.site}</span>
            )}
            <span className="truncate">{entry.message}</span>
          </span>
          <span className="text-[10px] text-muted-foreground text-right tabular-nums">
            {entry.delta_ms ? `${entry.delta_ms}ms` : ""}
          </span>
        </div>
      </div>
    );
  }

  return null;
}