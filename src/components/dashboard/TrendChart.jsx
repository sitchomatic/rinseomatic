import React from "react";
import { format, startOfDay, subDays } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

// 7-day stacked bar chart of working/failed/error counts derived from runs.
// Buckets by day-of-completion (ended_at fallback to created_date).
export default function TrendChart({ runs }) {
  const data = React.useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      days.push({
        key: day.getTime(),
        label: format(day, "EEE d"),
        working: 0,
        failed: 0,
        error: 0,
      });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const r of runs) {
      const stamp = r.ended_at || r.created_date;
      if (!stamp) continue;
      const dayKey = startOfDay(new Date(stamp)).getTime();
      const slot = byKey.get(dayKey);
      if (!slot) continue;
      slot.working += r.working_count || 0;
      slot.failed += r.failed_count || 0;
      slot.error += r.error_count || 0;
    }
    return days;
  }, [runs]);

  const total = data.reduce((a, d) => a + d.working + d.failed + d.error, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">7-day activity</div>
          <div className="text-sm font-medium mt-0.5">{total.toLocaleString()} test{total === 1 ? "" : "s"} this week</div>
        </div>
      </div>
      <div className="h-48">
        {total === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No activity in the last 7 days.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--secondary) / 0.4)" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
              <Bar dataKey="working" stackId="x" fill="hsl(158 64% 52%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="failed" stackId="x" fill="hsl(0 72% 62%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="error" stackId="x" fill="hsl(43 96% 56%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}