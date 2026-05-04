import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wrench, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function RemediationPanel() {
  const qc = useQueryClient();
  const healMut = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("autoHealRuns", {});
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["test-runs"] });
      qc.invalidateQueries({ queryKey: ["test-results"] });
      if (data.ok) {
        toast.success(data.note || `Auto-heal complete. Scanned ${data.scanned} runs, healed ${data.healed?.length || 0}.`);
      } else {
        toast.error("Auto-heal failed to run properly");
      }
    },
    onError: (e) => toast.error(e?.message || "Failed to auto-heal"),
  });

  return (
    <Card className="bg-card/40 border-border/60 mb-6">
      <CardHeader className="pb-3 border-b border-border/40 flex flex-row justify-between items-center">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" /> System Remediation
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Selectively re-run and heal stuck test steps for specific users or sites. Allows for quick validation of self-healed results.
          </CardDescription>
        </div>
        <Button onClick={() => healMut.mutate()} disabled={healMut.isPending} className="gap-2" size="sm">
          {healMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {healMut.isPending ? "Healing..." : "Run Auto-Heal"}
        </Button>
      </CardHeader>
    </Card>
  );
}