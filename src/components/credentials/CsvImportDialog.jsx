import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
//
// Pre-import diff: classifies each parsed row as new / duplicate (already in
// vault with same username+password) / invalid (missing field). Only "new"
// rows are sent to bulkCreate.
export default function CsvImportDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [text, setText] = React.useState("");

  React.useEffect(() => { if (open) setText(""); }, [open]);

  // Pull existing vault to dedup against. Cached by react-query so it doesn't
  // re-fetch every keystroke; the diff itself runs in-memory.
  const { data: existing = [] } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => base44.entities.Credential.list("-created_date", 5000),
    enabled: open,
    staleTime: 60_000,
  });

  const preview = React.useMemo(() => {
    const rows = parseCSV(text);
    if (rows.length === 0) return { newRecords: [], duplicates: 0, invalid: 0, skippedHeader: false, totalRows: 0 };
    const first = rows[0].map((c) => (c || "").toLowerCase());
    const hasHeader = first.includes("username") || first.includes("email") || first.includes("password");
    const data = hasHeader ? rows.slice(1) : rows;

    // Existing (username+password) keys to dedup against the vault.
    const vaultKeys = new Set(existing.map((c) => `${(c.username || "").toLowerCase()}|${c.password || ""}`));
    // Within-CSV dedup so two identical rows in the same paste only count once.
    const seenInCsv = new Set();

    const newRecords = [];
    let duplicates = 0;
    let invalid = 0;
    for (const r of data) {
      const username = (r[0] || "").trim();
      const password = (r[1] || "").trim();
      if (!username || !password) { invalid++; continue; }
      const key = `${username.toLowerCase()}|${password}`;
      if (vaultKeys.has(key) || seenInCsv.has(key)) { duplicates++; continue; }
      seenInCsv.add(key);
      newRecords.push({
        username,
        password,
        extra_passwords: r.slice(2).map((x) => (x || "").trim()).filter(Boolean),
      });
    }
    return { newRecords, duplicates, invalid, skippedHeader: hasHeader, totalRows: data.length };
  }, [text, existing]);

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
          {preview.totalRows === 0 ? (
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
              No rows detected yet.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <DiffStat label="New" value={preview.newRecords.length} tone="emerald" />
              <DiffStat label="Duplicates" value={preview.duplicates} tone="muted" help="already in vault or repeated" />
              <DiffStat label="Invalid" value={preview.invalid} tone="amber" help="missing username/password" />
            </div>
          )}
          {preview.skippedHeader && (
            <div className="text-[10px] font-mono text-muted-foreground">Header row auto-detected and skipped.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mut.mutate(preview.newRecords)}
            disabled={preview.newRecords.length === 0 || mut.isPending}
          >
            {mut.isPending ? "Importing…" : `Import ${preview.newRecords.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiffStat({ label, value, tone, help }) {
  const toneCls = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    muted: "border-border bg-secondary/30 text-muted-foreground",
  }[tone] || "border-border bg-secondary/30 text-muted-foreground";
  return (
    <div className={`rounded-md border px-3 py-2 ${toneCls}`}>
      <div className="text-[10px] font-mono uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {help && <div className="text-[10px] font-mono opacity-70 leading-snug">{help}</div>}
    </div>
  );
}