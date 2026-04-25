import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import RunCard from "@/components/runs/RunCard";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/shared/EmptyState";

export default function Runs() {
  const navigate = useNavigate();

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["test-runs"],
    queryFn: () => base44.entities.TestRun.list("-created_date", 200),
    refetchInterval: 3000,
  });
  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
  });
  const siteLabel = (k) => sites.find((s) => s.key === k)?.label || k;

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="02 · queue"
        title="Test runs"
        description="Manual batches tested via Browserless. Runs persist — safe to close this tab."
        actions={
          <Button size="sm" className="gap-2" onClick={() => navigate("/credentials")}>
            <Play className="h-3.5 w-3.5" /> New run
          </Button>
        }
      />

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card/40 py-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={Play}
          title="No test runs yet"
          description="Pick credentials in the vault and kick off a batch to test them via Browserless."
          action={
            <Button size="sm" className="gap-2" onClick={() => navigate("/credentials")}>
              <Play className="h-3.5 w-3.5" /> Start a run
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {runs.map((r) => <RunCard key={r.id} run={r} siteLabel={siteLabel(r.site_key)} />)}
        </div>
      )}
    </div>
  );
}