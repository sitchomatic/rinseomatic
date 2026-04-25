import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, ClipboardPaste, FileText } from "lucide-react";
import { parseCSV, detectSite } from "@/lib/csv";
import { toast } from "sonner";

// Header detection helpers
const norm = (s) => (s || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

function findCol(headers, candidates) {
  const idx = headers.findIndex((h) => candidates.includes(norm(h)));
  return idx === -1 ? null : idx;
}

// Returns indexes of all "passwordN" / "passN" / "pwN" columns (N >= 2),
// plus any single "passwords" column (pipe/semicolon separated).
function findExtraPasswordCols(headers) {
  const extras = [];
  let combined = null;
  headers.forEach((h, i) => {
    const n = norm(h);
    if (n === "passwords") combined = i;
    const m = n.match(/^(?:password|pass|pwd|pw)(\d+)$/);
    if (m && Number(m[1]) >= 2) extras.push(i);
  });
  return { extras, combined };
}

// Parse raw CSV text into a preview of rows ready to import. Pure — used by
// both the file-upload tab and the paste tab.
function buildPreview(text, sites, fallbackSite) {
  const rows = parseCSV(text);
  if (rows.length === 0) return { rows: [], skipped: 0 };

  const headers = rows[0].map((h) => h);
  const userIdx = findCol(headers.map(norm), ["username", "user", "email", "login"]);
  const passIdx = findCol(headers.map(norm), ["password", "pass", "pwd", "pw"]);
  const siteIdx = findCol(headers.map(norm), ["site", "sitekey", "target"]);
  const urlIdx  = findCol(headers.map(norm), ["url", "link", "domain"]);
  const { extras: extraPwIdxs, combined: combinedPwIdx } = findExtraPasswordCols(headers.map(norm));

  if (userIdx === null || passIdx === null) {
    return { rows: [], skipped: rows.length - 1, error: "Need at least 'username' and 'password' columns." };
  }

  const out = [];
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const username = (r[userIdx] || "").trim();
    const password = (r[passIdx] || "").trim();
    if (!username || !password) { skipped++; continue; }

    const explicitSite = siteIdx !== null ? r[siteIdx] : "";
    const url = urlIdx !== null ? r[urlIdx] : "";
    const detected = detectSite(explicitSite, url, username, sites);
    const site_key = detected || fallbackSite;
    if (!site_key) { skipped++; continue; }

    const extra = [];
    for (const idx of extraPwIdxs) {
      const v = (r[idx] || "").trim();
      if (v && v !== password && !extra.includes(v)) extra.push(v);
    }
    if (combinedPwIdx !== null) {
      const raw = (r[combinedPwIdx] || "").trim();
      if (raw) {
        for (const v of raw.split(/[|;]/).map((s) => s.trim()).filter(Boolean)) {
          if (v !== password && !extra.includes(v)) extra.push(v);
        }
      }
    }

    const row = { username, password, site_key, status: "untested" };
    if (extra.length) row.extra_passwords = extra;
    out.push(row);
  }
  return { rows: out, skipped };
}

export default function CsvImportDialog({ open, onOpenChange, sites, onImport }) {
  const [tab, setTab] = React.useState("file");
  const [fallbackSite, setFallbackSite] = React.useState("");
  const [pasted, setPasted] = React.useState("");
  const [preview, setPreview] = React.useState(null);

  React.useEffect(() => {
    if (!open) {
      setPasted(""); setPreview(null); setTab("file");
    } else if (!fallbackSite && sites?.[0]) {
      setFallbackSite(sites[0].key);
    }
  }, [open, sites, fallbackSite]);

  const handleFile = async (f) => {
    const text = await f.text();
    setPreview(buildPreview(text, sites, fallbackSite));
  };

  // Re-parse pasted text on every keystroke (cheap — local parse).
  React.useEffect(() => {
    if (tab !== "paste") return;
    if (!pasted.trim()) { setPreview(null); return; }
    setPreview(buildPreview(pasted, sites, fallbackSite));
  }, [pasted, tab, sites, fallbackSite]);

  const doImport = () => {
    if (!preview?.rows?.length) return;
    onImport(preview.rows);
    onOpenChange(false);
    toast.success(`Imported ${preview.rows.length} credential${preview.rows.length === 1 ? "" : "s"}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Import credentials from CSV</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Required columns: <span className="font-mono">username</span>, <span className="font-mono">password</span>.
            Optional: <span className="font-mono">site</span> or <span className="font-mono">url</span> (auto-detected),
            and extra passwords as <span className="font-mono">password2, password3…</span> or a pipe-separated{" "}
            <span className="font-mono">passwords</span> column.
          </p>

          <div className="grid gap-1.5">
            <Label className="text-xs">Fallback site (when row has no site/url)</Label>
            <Select value={fallbackSite} onValueChange={setFallbackSite}>
              <SelectTrigger><SelectValue placeholder="Pick a site" /></SelectTrigger>
              <SelectContent>
                {(sites || []).map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.label} · {s.key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={tab} onValueChange={(v) => { setTab(v); setPreview(null); }}>
            <TabsList className="bg-secondary/40 border border-border">
              <TabsTrigger value="file" className="gap-1.5"><FileText className="h-3 w-3" /> Upload file</TabsTrigger>
              <TabsTrigger value="paste" className="gap-1.5"><ClipboardPaste className="h-3 w-3" /> Paste CSV</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="mt-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="block text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80"
              />
            </TabsContent>
            <TabsContent value="paste" className="mt-3">
              <Textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"username,password,site\nalice@example.com,hunter2,joe\nbob@example.com,letmein,ignition"}
                className="font-mono text-xs h-40"
              />
            </TabsContent>
          </Tabs>

          {preview && (
            <div className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-xs">
              {preview.error ? (
                <div className="text-rose-300">{preview.error}</div>
              ) : (
                <>
                  <div>
                    Parsed <span className="font-mono text-foreground">{preview.rows.length}</span> credential
                    {preview.rows.length === 1 ? "" : "s"}
                    {preview.skipped > 0 && (
                      <span className="text-muted-foreground"> · skipped {preview.skipped}</span>
                    )}
                  </div>
                  {preview.rows.some((r) => r.extra_passwords?.length) && (
                    <div className="text-muted-foreground mt-1">
                      Detected extra passwords on{" "}
                      {preview.rows.filter((r) => r.extra_passwords?.length).length} row(s).
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={doImport} disabled={!preview?.rows?.length} className="gap-2">
            <Upload className="h-3.5 w-3.5" /> Import {preview?.rows?.length || 0}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}