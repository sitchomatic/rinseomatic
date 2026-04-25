import React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Globe, Search, ShieldCheck, Activity, Cpu, Bot } from "lucide-react";

const LEVEL_STYLES = {
  success: "text-emerald-300 border-emerald-500/40",
  error: "text-rose-300 border-rose-500/40",
  warn: "text-amber-300 border-amber-500/40",
  info: "text-sky-300 border-sky-500/40",
  debug: "text-muted-foreground border-border",
};

const LEVEL_DOT = {
  success: "bg-emerald-400",
  error: "bg-rose-400",
  warn: "bg-amber-400",
  info: "bg-sky-400",
  debug: "bg-muted-foreground/60",
};

const CAT_ICON = {
  network: Globe,
  dom: Search,
  auth: ShieldCheck,
  proxy: Activity,
  ai: Bot,
  system: Cpu,
};

export default function LogRow({ log, isNew }) {
  const Icon = CAT_ICON[log.category] || Cpu;
  const ts = log.timestamp || log.created_date;
  return (
    <div
      className={cn(
        "grid grid-cols-[88px_24px_72px_64px_1fr] gap-3 px-3 py-1.5 items-center text-[11px] font-mono border-l-2 transition-colors",
        LEVEL_STYLES[log.level] || LEVEL_STYLES.info,
        isNew && "animate-row-in bg-primary/5"
      )}
    >
      <div className="text-muted-foreground tabular-nums">
        {ts ? format(new Date(ts), "HH:mm:ss.SSS") : "—"}
      </div>
      <Icon className="h-3 w-3 text-muted-foreground" />
      <div className="uppercase tracking-wider text-[10px] truncate">
        {log.category || "system"}
      </div>
      <div className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
        <span className={cn("h-1.5 w-1.5 rounded-full", LEVEL_DOT[log.level] || LEVEL_DOT.info)} />
        {log.level || "info"}
      </div>
      <div className="min-w-0 flex items-center gap-2">
        {log.site && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-0.5 shrink-0">
            {log.site}
          </span>
        )}
        <span className="truncate text-foreground/90" title={log.message}>{log.message}</span>
        {log.delta_ms ? (
          <span className="text-muted-foreground shrink-0 ml-auto tabular-nums">
            {log.delta_ms}ms
          </span>
        ) : null}
      </div>
    </div>
  );
}