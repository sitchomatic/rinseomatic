import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { parseCSV } from "@/lib/csv";

// Lightweight CSV import for the global vault. Expects rows of:
//   username, password [, extra1, extra2, ...]
// First line may be a header (auto-detected and skipped).
export default function CsvImportDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [text, setText] = React.useState("");

  React.useEffect(() => { if (open) setText(""); }, [open]);

  const preview = React.useMemo(() => {
    const rows = parseCSV(text);
    if (rows.length === 0) return { records: [], skippedHeader: false };
    const first = rows[0].map((c) => (c || "").toLowerCase());
    const hasHeader = first.includes("username") || first.includes("email") || first.includes("password");
    const data = hasHeader ? rows.slice(1) : rows;
    const records = data
      .map((r) => ({
        username: (r[0] || "").trim(),
        password: (r[1] || "").trim(),
        extra_passwords: r.slice(2).map((x) => (x || "").trim()).filter(Boolean),
      }))
      .filter((r) => r.username && r.password);
    return { records, skippedHeader: hasHeader };
  }, [text]);

  const mut = useMutation({
    mutationFn: async (records) => {
      const CHUNK = 100;
      let total = 0;
      for (let i = 0; i < records.length; i += CHUNK) {
        const batch = records.slice(i, i + CHUNK);
        await base44.entities.Credential.bulkCreate(batch);
        total += batch.length;
      }
      return total;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["credentials"] });
      toast.success(`Imported ${count} credential${count === 1 ? "" : "s"}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e?.message || "Import failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-snug">
            Paste rows in the format <span className="font-mono text-foreground">username, password, [extra1, extra2…]</span>. A header row is auto-detected.
          </p>
          <div className="grid gap-1.5">
            <Label className="text-xs">CSV content</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder="username,password&#10;alice@example.com,hunter2&#10;bob@example.com,letmein,oldpass1,oldpass2"
            />
          </div>
          <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
            {preview.records.length > 0
              ? <>Will import <span className="text-foreground">{preview.records.length}</span> credential{preview.records.length === 1 ? "" : "s"}{preview.skippedHeader ? " (header row skipped)" : ""}.</>
              : "No valid rows detected yet."}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mut.mutate(preview.records)}
            disabled={preview.records.length === 0 || mut.isPending}
          >
            {mut.isPending ? "Importing…" : `Import ${preview.records.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}