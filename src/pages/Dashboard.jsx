import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { KeyRound, CheckCircle2, XCircle, Activity, Play, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import SiteBreakdown from "@/components/dashboard/SiteBreakdown";
import RecentRuns from "@/components/dashboard/RecentRuns";
import ActivitySummary from "@/components/dashboard/ActivitySummary";
import { buildCredentialReport } from "@/lib/credentialReport";
import { downloadFile } from "@/lib/download";

export default function Dashboard() {
  const { data: credentials = [], isLoading: loadingCreds } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => base44.entities.Credential.list("-created_date", 10000),
    staleTime: 30_000,
  });
  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
    staleTime: 5 * 60_000,
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["test-runs"],
    queryFn: () => base44.entities.TestRun.list("-created_date", 50),
    staleTime: 30_000,
    refetchInterval: (q) => {
      const list = q.state.data || [];
      return list.some((r) => r.status === "running" || r.status === "queued") ? 5000 : false;
    },
  });

  // C1: Single-pass aggregator over credentials — was 4 sequential filter()
  // calls, each scanning the full array.
  const { total, working, failed, errored, untested } = React.useMemo(() => {
    let working = 0, failed = 0, errored = 0, untested = 0;
    for (const c of credentials) {
      if (c.status === "working") working++;
      else if (c.status === "failed") failed++;
      else if (c.status === "error") errored++;
      else untested++; // null / undefined / "untested"
    }
    return { total: credentials.length, working, failed, errored, untested };
  }, [credentials]);

  const pct = total ? Math.round((working / total) * 100) : 0;
  const activeRuns = React.useMemo(
    () => runs.reduce((n, r) => n + (r.status === "running" || r.status === "queued" ? 1 : 0), 0),
    [runs]
  );

  const downloadReport = () => {
    if (!credentials.length) return toast.error("Vault is empty — nothing to export");
    const csv = buildCredentialReport(credentials, sites);
    const stamp = format(new Date(), "yyyyMMdd-HHmm");
    downloadFile(`credential-report-${stamp}.csv`, csv);
    toast.success(`Exported ${credentials.length} credentials`);
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="00 · overview"
        title="Dashboard"
        description="At-a-glance health of your credential vault and recent test activity."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2" onClick={downloadReport} disabled={!credentials.length}>
              <Download className="h-3.5 w-3.5" /> Download report
            </Button>
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

      <ActivitySummary credentials={credentials} runs={runs} />

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