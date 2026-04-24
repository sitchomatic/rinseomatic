import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import ProxyControls from "@/components/shared/ProxyControls";

export default function NewRunDialog({
  open,
  onOpenChange,
  sites,
  defaultSiteKey,
  credentialCount,
  countsBySite,
  lockedSiteKey,
  targetSiteKeys,       // optional: lock this run to specific target sites (e.g. ['joe'])
  titleOverride,
  onCreate,
}) {
  const [form, setForm] = React.useState({
    site_key: "", concurrency: 2, max_retries: 1, label: "",
  });
  const [overrideProxy, setOverrideProxy] = React.useState(false);
  const [proxy, setProxy] = React.useState({ type: "stealth", country_code: "au", external_proxy_id: "" });

  const { data: settingsList = [] } = useQuery({
    queryKey: ["app_settings"],
    queryFn: () => base44.entities.AppSettings.list("-created_date", 1),
    enabled: open,
  });
  const settings = settingsList[0];

  const { data: proxies = [] } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => base44.entities.Proxy.list("-created_date", 100),
    enabled: open,
  });
  const enabledProxies = proxies.filter((p) => p.enabled !== false);

  React.useEffect(() => {
    if (!open) return;
    const bestSite = (sites || [])
      .map((s) => ({ key: s.key, n: countsBySite?.[s.key] || 0 }))
      .sort((a, b) => b.n - a.n)[0];
    const autoSite = bestSite && bestSite.n > 0 ? bestSite.key : sites?.[0]?.key;
    setForm({
      site_key: defaultSiteKey || autoSite || "",
      concurrency: 2,
      max_retries: 1,
      label: "",
    });
    setOverrideProxy(false);
    setProxy({
      type: settings?.proxy_type || "stealth",
      country_code: settings?.country_code || "au",
      external_proxy_id: settings?.external_proxy_id || "",
    });
  }, [open, sites, defaultSiteKey, countsBySite, settings?.id]);

  const effectiveCount = countsBySite
    ? (countsBySite[form.site_key] || 0)
    : (form.site_key === defaultSiteKey ? (credentialCount || 0) : 0);

  const siteLocked = !!lockedSiteKey;

  const handleStart = () => {
    const payload = {
      ...form,
      target_site_keys: Array.isArray(targetSiteKeys) && targetSiteKeys.length > 0 ? targetSiteKeys : undefined,
      proxy: overrideProxy ? proxy : undefined,
    };
    onCreate(payload);
    onOpenChange(false);
  };

  const defaultSummary = settings
    ? `${settings.proxy_type || "stealth"}${settings.country_code ? ` · ${settings.country_code.toUpperCase()}` : ""}`
    : "stealth · AU";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titleOverride || "New test run"}</DialogTitle>
        </DialogHeader>
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
            {Array.isArray(targetSiteKeys) && targetSiteKeys.length > 0 && (
              <p className="text-[11px] text-primary">Testing only against: <span className="font-mono">{targetSiteKeys.join(", ")}</span></p>
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

          <div className="rounded-lg border border-border bg-background/40 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">Proxy override</div>
                <div className="text-[11px] text-muted-foreground">
                  {overrideProxy ? "Using custom proxy for this run" : `Using defaults: ${defaultSummary}`}
                </div>
              </div>
              <Switch checked={overrideProxy} onCheckedChange={setOverrideProxy} />
            </div>
            {overrideProxy && (
              <ProxyControls value={proxy} onChange={setProxy} externalProxies={enabledProxies} compact />
            )}
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
          <Button onClick={handleStart} disabled={!form.site_key || effectiveCount === 0}>
            Start run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}