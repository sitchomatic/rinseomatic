import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import { Activity, TrendingUp } from "lucide-react";

// Visual summary panel: donut of credential outcomes + horizontal bars of
// the most recent runs' working/failed mix. Pure presentational — receives
// already-tallied numbers from the Dashboard page.
export default function ActivitySummary({ credentials, runs }) {
  const { donut, recent, activeRuns } = React.useMemo(() => {
    let working = 0, failed = 0, errored = 0, untested = 0;
    for (const c of credentials || []) {
      if (c.status === "working") working++;
      else if (c.status === "failed") failed++;
      else if (c.status === "error") errored++;
      else untested++;
    }
    const donut = [
      { name: "Working", value: working, color: "hsl(158 64% 52%)" },
      { name: "Failed", value: failed, color: "hsl(0 72% 62%)" },
      { name: "Errored", value: errored, color: "hsl(43 96% 56%)" },
      { name: "Untested", value: untested, color: "hsl(220 8% 40%)" },
    ].filter((d) => d.value > 0);

    const recent = (runs || [])
      .filter((r) => (r.total_count || 0) > 0)
      .slice(0, 6)
      .map((r) => {
        const total = r.total_count || 1;
        return {
          name: (r.label || r.site_key || "—").slice(0, 18),
          working: r.working_count || 0,
          failed: r.failed_count || 0,
          successRate: Math.round(((r.working_count || 0) / total) * 100),
        };
      })
      .reverse();

    const activeRuns = (runs || []).reduce(
      (n, r) => n + (r.status === "running" || r.status === "queued" ? 1 : 0),
      0
    );
    return { donut, recent, activeRuns };
  }, [credentials, runs]);

  const totalCreds = donut.reduce((n, d) => n + d.value, 0);
  const successPct = totalCreds
    ? Math.round((donut.find((d) => d.name === "Working")?.value || 0) / totalCreds * 100)
    : 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-border bg-secondary/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Activity summary
          </div>
        </div>
        {activeRuns > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-sky-300">
            <span className="live-dot text-sky-400">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400 inline-block" />
            </span>
            {activeRuns} active run{activeRuns === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 p-5">
        {/* Donut: overall credential health */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative h-[160px] w-[160px]">
            {totalCreds > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="value"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {donut.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(225 10% 8%)",
                      border: "1px solid hsl(225 10% 14%)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    itemStyle={{ color: "hsl(210 20% 96%)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-full border border-dashed border-border" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-2xl font-semibold tabular-nums text-emerald-300">{successPct}%</div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                success rate
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 text-[10px] font-mono">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
                {d.name} <span className="text-foreground tabular-nums ml-auto">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar chart: recent run outcomes */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-3 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            Recent runs · success rate
          </div>
          {recent.length === 0 ? (
            <div className="h-[180px] rounded-md border border-dashed border-border bg-card/40 flex items-center justify-center text-xs text-muted-foreground">
              No completed runs yet.
            </div>
          ) : (
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recent} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "hsl(220 8% 60%)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(225 10% 14%)" }}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(225 8% 14% / 0.5)" }}
                    contentStyle={{
                      background: "hsl(225 10% 8%)",
                      border: "1px solid hsl(225 10% 14%)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    itemStyle={{ color: "hsl(210 20% 96%)" }}
                    formatter={(value, name) => [value, name === "successRate" ? "Success %" : name]}
                  />
                  <Bar dataKey="successRate" radius={[4, 4, 0, 0]} fill="hsl(158 64% 52%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}