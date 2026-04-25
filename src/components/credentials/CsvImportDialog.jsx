import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Upload } from "lucide-react";
import { parseCSV } from "@/lib/csv";

function parseCsv(text) {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];
  const headerCells = rows[0].map((h) => h.trim().toLowerCase());
  const uIdx = headerCells.findIndex((h) => ["username", "email", "user"].includes(h));
  const pIdx = headerCells.findIndex((h) => ["password", "pass"].includes(h));
  const hasHeader = uIdx !== -1 && pIdx !== -1;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map((cells) => {
    if (hasHeader) return { username: (cells[uIdx] || "").trim(), password: (cells[pIdx] || "").trim() };
    return { username: (cells[0] || "").trim(), password: (cells[1] || "").trim() };
  }).filter((r) => r.username && r.password);
}

export default function CsvImportDialog({ open, onOpenChange, sites, onImport }) {
  const [siteKey, setSiteKey] = React.useState("");
  const [rows, setRows] = React.useState([]);
  const [fileName, setFileName] = React.useState("");

  React.useEffect(() => {
    if (open) { setSiteKey(sites?.[0]?.key || ""); setRows([]); setFileName(""); }
  }, [open, sites]);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    setRows(parseCsv(text));
  };

  const submit = () => {
    if (!siteKey || rows.length === 0) return;
    onImport(rows.map((r) => ({ ...r, site_key: siteKey, status: "untested" })));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Import CSV</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Site (applied to all rows)</Label>
            <Select value={siteKey} onValueChange={setSiteKey}>
              <SelectTrigger><SelectValue placeholder="Pick a site" /></SelectTrigger>
              <SelectContent>
                {(sites || []).map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 px-3 py-6 rounded-lg border border-dashed border-border bg-secondary/30 cursor-pointer hover:bg-secondary/50 text-sm">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {fileName ? `${fileName} · ${rows.length} rows` : "Click to upload CSV (columns: username,password)"}
            </span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!siteKey || rows.length === 0}>Import {rows.length || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}