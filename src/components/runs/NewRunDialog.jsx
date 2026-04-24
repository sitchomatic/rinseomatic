import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

export default function NewRunDialog({
  open,
  onOpenChange,
  sites,
  defaultSiteKey,
  credentialCount,      // count for the currently-selected credentials (if any)
  countsBySite,         // optional: { [site_key]: number } total creds per site
  lockedSiteKey,        // optional: when running against a specific selection, lock site
  onCreate,
}) {
  const [form, setForm] = React.useState({ site_key: "", concurrency: 2, max_retries: 1, label: "" });

  React.useEffect(() => {
    if (!open) return;
    // Prefer default site, else first site that actually has credentials, else first site
    const firstWithCreds = (sites || []).find((s) => (countsBySite?.[s.key] || 0) > 0)?.key;
    setForm({
      site_key: defaultSiteKey || firstWithCreds || sites?.[0]?.key || "",
      concurrency: 2,
      max_retries: 1,
      label: "",
    });
  }, [open, sites, defaultSiteKey, countsBySite]);

  // If we have countsBySite, use that for the selected site; otherwise fall back to the passed credentialCount
  const effectiveCount = countsBySite
    ? (countsBySite[form.site_key] || 0)
    : (form.site_key === defaultSiteKey ? (credentialCount || 0) : 0);

  const siteLocked = !!lockedSiteKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New test run</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Site</Label>
            <Select
              value={form.site_key}
              onValueChange={(v) => setForm({ ...form, site_key: v })}
              disabled={siteLocked}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(sites || []).map((s) => {
                  const n = countsBySite?.[s.key];
                  return (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}{typeof n === "number" ? ` · ${n}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {siteLocked && (
              <p className="text-[11px] text-muted-foreground">Locked to selection on the credentials page.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Concurrency (1–5)</Label>
              <Input type="number" min={1} max={5} value={form.concurrency}
                onChange={(e) => setForm({ ...form, concurrency: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} />
            </div>
            <div className="grid gap-2">
              <Label>Retries on error</Label>
              <Input type="number" min={0} max={3} value={form.max_retries}
                onChange={(e) => setForm({ ...form, max_retries: Math.max(0, Math.min(3, Number(e.target.value) || 0)) })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Label (optional)</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. nightly batch" />
          </div>
          {effectiveCount === 0 ? (
            <p className="text-xs text-amber-300">
              No credentials saved for <span className="font-mono">{form.site_key || "—"}</span>. Add or import some on the Credentials page first.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Will queue <span className="font-mono text-foreground">{effectiveCount}</span> credential
              {effectiveCount === 1 ? "" : "s"} for <span className="font-mono text-foreground">{form.site_key || "—"}</span>.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onCreate(form); onOpenChange(false); }} disabled={!form.site_key || effectiveCount === 0}>
            Start run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}