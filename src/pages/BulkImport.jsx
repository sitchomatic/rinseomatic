import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileType, CheckCircle2, AlertCircle } from "lucide-react";
import { parseCSV } from "@/lib/csv";

export default function BulkImport() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [siteKey, setSiteKey] = useState("");
  const [secondarySiteKeys, setSecondarySiteKeys] = useState("");
  const [preview, setPreview] = useState(null);

  const { data: existing = [] } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => base44.entities.Credential.list("-created_date", 5000),
    staleTime: 60_000,
  });

  const handleFileChange = async (e) => {
    const selected = e.target.files[0];
    if (!selected) {
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(selected);

    try {
      const text = await selected.text();
      let records = [];

      if (selected.name.endsWith(".json")) {
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          records = json;
        } else {
          toast.error("JSON file must contain an array of objects.");
          return;
        }
      } else if (selected.name.endsWith(".csv")) {
        const rows = parseCSV(text);
        if (rows.length > 0) {
          const first = rows[0].map(c => (c || "").toLowerCase().trim());
          const hasHeader = first.includes("username") || first.includes("email") || first.includes("password");
          const dataRows = hasHeader ? rows.slice(1) : rows;

          // Figure out column indices if there is a header
          let userIdx = 0, passIdx = 1;
          if (hasHeader) {
            const u = first.indexOf("username");
            const e = first.indexOf("email");
            userIdx = u !== -1 ? u : (e !== -1 ? e : 0);
            const p = first.indexOf("password");
            passIdx = p !== -1 ? p : 1;
          }

          records = dataRows.map(r => ({
            username: (r[userIdx] || "").trim(),
            password: (r[passIdx] || "").trim(),
            extra_passwords: r.filter((_, i) => i !== userIdx && i !== passIdx).map(x => (x || "").trim()).filter(Boolean)
          }));
        }
      } else {
        toast.error("Unsupported file format. Please upload CSV or JSON.");
        return;
      }

      // Pre-process and deduplicate
      const vaultKeys = new Set(existing.map(c => `${(c.username || "").toLowerCase()}|${c.password || ""}`));
      const seenInFile = new Set();
      const newRecords = [];
      let duplicates = 0;
      let invalid = 0;

      for (const r of records) {
        const u = r.username || r.email || "";
        const p = r.password || "";
        if (!u || !p) {
          invalid++;
          continue;
        }
        const key = `${u.toLowerCase()}|${p}`;
        if (vaultKeys.has(key) || seenInFile.has(key)) {
          duplicates++;
          continue;
        }
        seenInFile.add(key);
        newRecords.push({
          username: u,
          password: p,
          extra_passwords: Array.isArray(r.extra_passwords) ? r.extra_passwords : [],
          notes: r.notes || "",
        });
      }

      setPreview({ newRecords, duplicates, invalid, total: records.length });
    } catch (err) {
      toast.error(`Error reading file: ${err.message}`);
      setFile(null);
      setPreview(null);
    }
  };

  const importMut = useMutation({
    mutationFn: async (records) => {
      const CHUNK = 100;
      let total = 0;
      const secKeys = secondarySiteKeys.trim() ? secondarySiteKeys.split(",").map(k => k.trim()).filter(Boolean) : undefined;
      
      const payload = records.map(r => ({
        ...r,
        site_key: siteKey.trim() || undefined,
        secondary_site_keys: secKeys,
      }));

      for (let i = 0; i < payload.length; i += CHUNK) {
        const batch = payload.slice(i, i + CHUNK);
        await base44.entities.Credential.bulkCreate(batch);
        total += batch.length;
      }
      return total;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["credentials"] });
      toast.success(`Successfully imported ${count} credential${count === 1 ? "" : "s"}`);
      navigate("/credentials");
    },
    onError: (e) => toast.error(e?.message || "Import failed"),
  });

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1000px] mx-auto">
      <PageHeader
        eyebrow="data · tools"
        title="Bulk Import"
        description="Upload CSV or JSON files to import hundreds of credentials at once."
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Import Details</CardTitle>
          <CardDescription>Assign metadata to this batch and select a file to upload.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary Site Key (Optional)</Label>
              <Input
                value={siteKey}
                onChange={(e) => setSiteKey(e.target.value)}
                placeholder="e.g., double"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Assigns a target site key to all credentials in this batch.</p>
            </div>
            <div className="space-y-2">
              <Label>Secondary Site Keys (Optional)</Label>
              <Input
                value={secondarySiteKeys}
                onChange={(e) => setSecondarySiteKeys(e.target.value)}
                placeholder="e.g., joe, ignition"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Comma-separated secondary site keys.</p>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-border">
            <Label>Select File</Label>
            <Input
              type="file"
              accept=".csv,.json"
              onChange={handleFileChange}
              className="file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
            <p className="text-xs text-muted-foreground">
              Supports CSV (username, password, [extra1...]) or JSON (array of objects with username/password keys).
            </p>
          </div>

          {preview && (
            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-medium mb-3">Preview</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col items-center justify-center text-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mb-1" />
                  <div className="text-2xl font-bold text-emerald-400">{preview.newRecords.length}</div>
                  <div className="text-xs text-muted-foreground">New Records</div>
                </div>
                <div className="rounded-md border border-border bg-secondary/30 p-3 flex flex-col items-center justify-center text-center">
                  <FileType className="h-5 w-5 text-muted-foreground mb-1" />
                  <div className="text-2xl font-bold text-foreground">{preview.duplicates}</div>
                  <div className="text-xs text-muted-foreground">Duplicates Skipped</div>
                </div>
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col items-center justify-center text-center">
                  <AlertCircle className="h-5 w-5 text-amber-500 mb-1" />
                  <div className="text-2xl font-bold text-amber-400">{preview.invalid}</div>
                  <div className="text-xs text-muted-foreground">Invalid Rows</div>
                </div>
              </div>
            </div>
          )}

          <div className="pt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate("/credentials")}>
              Cancel
            </Button>
            <Button
              onClick={() => importMut.mutate(preview.newRecords)}
              disabled={!preview || preview.newRecords.length === 0 || importMut.isPending}
            >
              <Upload className="w-4 h-4 mr-2" />
              {importMut.isPending ? "Importing..." : `Import ${preview?.newRecords.length || ""} Credentials`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}