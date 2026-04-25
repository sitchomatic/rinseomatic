import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Lightbulb, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BLANK = { flow_name: "", site: "", failed_selector: "", suggested_selector: "", failure_reason: "", confidence: 0.7, status: "pending", reviewer_notes: "" };

export default function RepairSuggestionsPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(BLANK);
  const editing = !!draft.id;

  const { data: suggestions = [] } = useQuery({
    queryKey: ["repair-suggestions"],
    queryFn: () => base44.entities.RepairSuggestion.list("-created_date", 100),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (d) => d.id ? base44.entities.RepairSuggestion.update(d.id, d) : base44.entities.RepairSuggestion.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["repair-suggestions"] }); setDraft(BLANK); toast.success("Repair suggestion saved"); },
  });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.RepairSuggestion.update(id, { status, reviewed_at: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repair-suggestions"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.RepairSuggestion.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["repair-suggestions"] }); toast.success("Suggestion deleted"); },
  });

  const pending = suggestions.filter((s) => (s.status || "pending") === "pending").length;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Lightbulb className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Selector repair suggestions</div>
          <div className="text-xs text-muted-foreground mt-0.5">Review suggested selector fixes, approve or reject them, and keep notes for future repair workflows.</div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{pending} pending</span>
      </div>

      <div className="space-y-2">
        {suggestions.length === 0 && <div className="rounded-md border border-dashed border-border bg-card/40 py-6 text-center text-xs text-muted-foreground">No repair suggestions yet.</div>}
        {suggestions.map((s) => (
          <div key={s.id} className="rounded-md border border-border bg-secondary/20 px-3 py-2 space-y-2">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {s.site || "Unknown site"}
                  <Status status={s.status || "pending"} />
                  {s.confidence != null && <span className="text-[10px] font-mono text-muted-foreground">{Math.round(s.confidence * 100)}%</span>}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground truncate">{s.failed_selector} → {s.suggested_selector}</div>
                {s.failure_reason && <div className="text-[11px] text-muted-foreground mt-1">{s.failure_reason}</div>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDraft(s)}>Edit</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400" onClick={() => deleteMut.mutate(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-emerald-300" onClick={() => updateStatus.mutate({ id: s.id, status: "approved" })}><CheckCircle2 className="h-3 w-3" /> Approve</Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-rose-300" onClick={() => updateStatus.mutate({ id: s.id, status: "rejected" })}><XCircle className="h-3 w-3" /> Reject</Button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
        <div className="text-xs font-medium flex items-center gap-1.5"><Plus className="h-3 w-3" /> {editing ? "Edit suggestion" : "Add manual suggestion"}</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <F label="Site"><Input value={draft.site || ""} onChange={(e) => setDraft({ ...draft, site: e.target.value })} /></F>
          <F label="Flow name"><Input value={draft.flow_name || ""} onChange={(e) => setDraft({ ...draft, flow_name: e.target.value })} /></F>
          <F label="Failed selector"><Input className="font-mono text-xs" value={draft.failed_selector || ""} onChange={(e) => setDraft({ ...draft, failed_selector: e.target.value })} /></F>
          <F label="Suggested selector"><Input className="font-mono text-xs" value={draft.suggested_selector || ""} onChange={(e) => setDraft({ ...draft, suggested_selector: e.target.value })} /></F>
          <F label="Confidence"><Input type="number" step="0.01" min="0" max="1" value={draft.confidence ?? 0} onChange={(e) => setDraft({ ...draft, confidence: Number(e.target.value) || 0 })} /></F>
        </div>
        <F label="Reason"><Textarea rows={2} value={draft.failure_reason || ""} onChange={(e) => setDraft({ ...draft, failure_reason: e.target.value })} /></F>
        <F label="Reviewer notes"><Textarea rows={2} value={draft.reviewer_notes || ""} onChange={(e) => setDraft({ ...draft, reviewer_notes: e.target.value })} /></F>
        <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
          {editing && <Button variant="outline" size="sm" onClick={() => setDraft(BLANK)}>Cancel</Button>}
          <Button size="sm" onClick={() => saveMut.mutate(draft)} disabled={!draft.failed_selector || saveMut.isPending}>{saveMut.isPending ? "Saving…" : editing ? "Save suggestion" : "Add suggestion"}</Button>
        </div>
      </div>
    </div>
  );
}

function Status({ status }) {
  return <span className={cn("text-[10px] font-mono uppercase tracking-wider rounded border px-1.5 py-0.5", status === "approved" ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : status === "rejected" ? "text-rose-300 border-rose-500/30 bg-rose-500/10" : "text-amber-300 border-amber-500/30 bg-amber-500/10")}>{status}</span>;
}

function F({ label, children }) {
  return <div className="grid gap-1"><Label className="text-[11px]">{label}</Label>{children}</div>;
}