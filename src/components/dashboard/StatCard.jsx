import React from "react";
import { cn } from "@/lib/utils";

export default function StatCard({ label, value, sub, icon: Icon, accent, className }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        {Icon && <Icon className={cn("h-3.5 w-3.5", accent || "text-muted-foreground")} />}
      </div>
      <div className={cn("text-3xl font-semibold tabular-nums", accent)}>{value}</div>
      {sub && <div className="text-[11px] font-mono text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}