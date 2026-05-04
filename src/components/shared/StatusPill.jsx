import React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  failed: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  working: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  burned: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  idle: "bg-muted text-muted-foreground border-border",
  info: "bg-sky-500/10 text-sky-300 border-sky-500/20",
};

// Map domain statuses to visual variants
const STATUS_TO_VARIANT = {
  working: "success",
  healthy: "success",
  completed: "success",
  approved: "success",
  success: "success",

  failed: "failed",
  noaccount: "idle",
  down: "failed",
  rejected: "failed",
  error: "failed",
  
  tempdisabled: "warning",
  permdisabled: "burned",

  running: "working",
  pending: "working",
  queued: "working",

  rate_limited: "warning",
  degraded: "warning",
  warn: "warning",

  burned: "burned",

  untested: "idle",
  idle: "idle",
  cancelled: "idle",
};

export default function StatusPill({ status, variant, children, dot = true, className }) {
  const v = variant || STATUS_TO_VARIANT[status] || "idle";
  const v2 = VARIANTS[v] || VARIANTS.idle;
  const label = children ?? String(status ?? "").replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        v2,
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            v === "success" && "bg-emerald-400",
            v === "failed" && "bg-rose-400",
            v === "working" && "bg-sky-400",
            v === "warning" && "bg-amber-400",
            v === "burned" && "bg-orange-400",
            v === "idle" && "bg-muted-foreground/60",
            v === "info" && "bg-sky-400"
          )}
        />
      )}
      {label}
    </span>
  );
}