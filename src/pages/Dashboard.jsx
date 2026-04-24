import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { KeyRound, CheckCircle2, XCircle, Activity, Play } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import SiteBreakdown from "@/components/dashboard/SiteBreakdown";
import RecentRuns from "@/components/dashboard/RecentRuns";

export default function Dashboard() {
  const { data: credentials = [], isLoading: loadingCreds } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => base44.entities.Credential.list("-created_date", 5000),
  });
  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["test-runs"],
    queryFn: () => base44.entities.TestRun.list("-created_date", 50),
    refetchInterval: 5000,
  });

  const total = credentials.length;
  const working = credentials.filter((c) => c.status === "working").length;
  const failed = credentials.filter((c) => c.status === "failed").length;
  const errored = credentials.filter((c) => c.status === "error").length;
  const untested = credentials.filter((c) => !c.status || c.status === "untested").length;
  const pct = total ? Math.round((working / total) * 100) : 0;
  const activeRuns = runs.filter((r) => r.status === "running" || r.status === "queued").length;

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="00 · overview"
        title="Dashboard"
        description="At-a-glance health of your credential vault and recent test activity."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/credentials">Vault</Link>
            </Button>
            <Button size="sm" className="gap-2" asChild>
              <Link to="/credentials"><Play className="h-3.5 w-3.5" /> New run</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Credentials" value={total} sub={`${sites.length} sites`} icon={KeyRound} />
        <StatCard label="Working" value={working} sub={`${pct}% success`} icon={CheckCircle2} accent="text-emerald-300" />
        <StatCard label="Failed" value={failed} icon={XCircle} accent="text-rose-300" />
        <StatCard label="Untested" value={untested} sub={errored ? `${errored} errored` : undefined} />
        <StatCard label="Active runs" value={activeRuns} sub={runs.length ? `${runs.length} total` : "none yet"} icon={Activity} accent={activeRuns > 0 ? "text-sky-300" : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SiteBreakdown sites={sites} credentials={credentials} />
        <RecentRuns runs={runs} sites={sites} />
      </div>

      {!loadingCreds && total === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-card/40 py-10 text-center">
          <div className="text-sm font-medium mb-1">Your vault is empty</div>
          <div className="text-xs text-muted-foreground mb-4">Add credentials to start testing.</div>
          <Button size="sm" asChild><Link to="/credentials">Go to vault</Link></Button>
        </div>
      )}
    </div>
  );
}