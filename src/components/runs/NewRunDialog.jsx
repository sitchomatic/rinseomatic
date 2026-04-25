import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import RunProxyOverride from "./RunProxyOverride";

export default function NewRunDialog({
  open,
  onOpenChange,
  sites,
  defaultSiteKey,
  credentialCount,
  countsBySite,
  lockedSiteKey,
  lockedTargetKeys,       // e.g. ['joe'] when launched from a "Test via Joe" quick button
  lockedTargetLabel,      // friendly name of the locked target
  onCreate,
}) {
  const [form, setForm] = React.useState({
    site_key: "", concurrency: 2, max_retries: 1, label: "",
    target_key: "default",
    custom_url: "",
    login_strategy: "inherit",
    proxy: {},
  });

  const { data: proxies = [] } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => base44.entities.Proxy.list("-created_date", 100),
    enabled: open,
  });

  // A2: Reset form ONLY on the dialog opening (the user-visible event).
  // The previous deps included `countsBySite` (a fresh object each parent
  // render) and `lockedTargetKeys` (a fresh array), causing the effect to
  // re-run on parent re-renders and silently overwrite user input mid-edit.
  // We intentionally read the latest values via refs so we don't need them
  // as deps.
  const initRef = React.useRef({ sites, defaultSiteKey, countsBySite, lockedTargetKeys });
  initRef.current = { sites, defaultSiteKey, countsBySite, lockedTargetKeys };

  React.useEffect(() => {
    if (!open) return;
    const { sites: s, defaultSiteKey: d, countsBySite: cbs, lockedTargetKeys: ltk } = initRef.current;
    const bestSite = (s || [])
      .map((x) => ({ key: x.key, n: cbs?.[x.key] || 0 }))
      .sort((a, b) => b.n - a.n)[0];
    const autoSite = bestSite && bestSite.n > 0 ? bestSite.key : s?.[0]?.key;
    setForm({
      site_key: d || autoSite || "",
      concurrency: 2,
      max_retries: 1,
      label: "",
      target_key: ltk?.[0] || "default",
      custom_url: "",
      login_strategy: "inherit",
      proxy: {},
    });
  }, [open]);

  const effectiveCount = countsBySite
    ? (countsBySite[form.site_key] || 0)
    : (form.site_key === defaultSiteKey ? (credentialCount || 0) : 0);

  const siteLocked = !!lockedSiteKey;
  const targetLocked = !!lockedTargetKeys?.length;

  // For aggregator sites, allow user to pick which underlying site to test against
  const selectedSite = (sites || []).find((s) => s.key === form.site_key);
  const aggregatorTargets = Array.isArray(selectedSite?.secondary_site_keys) ? selectedSite.secondary_site_keys : [];
  const isAggregator = aggregatorTargets.length > 0;
  const targetLabel = (key) => (sites || []).find((s) => s.key === key)?.label || key;

  const handleCreate = () => {
    const target_site_keys =
      targetLocked ? lockedTargetKeys :
      (form.target_key && form.target_key !== "default") ? [form.target_key] :
      undefined;
    onCreate({
      site_key: form.site_key,
      concurrency: form.concurrency,
      max_retries: form.max_retries,
      label: form.label,
      target_site_keys,
      custom_url: form.custom_url || undefined,
      login_strategy: form.login_strategy === "inherit" ? undefined : form.login_strategy,
      proxy: form.proxy,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto thin-scroll">
        <DialogHeader><DialogTitle>New test run</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Site</Label>
            <Select value={form.site_key} onValueChange={(v) => setForm({ ...form, site_key: v, target_key: "default" })} disabled={siteLocked}>
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
            {siteLocked && <p className="text-[11px] text-muted-foreground">Locked to selection on the credentials page.</p>}
          </div>

          {(isAggregator || targetLocked) && (
            <div className="grid gap-2">
              <Label>Test against</Label>
              {targetLocked ? (
                <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-mono">
                  {lockedTargetLabel || lockedTargetKeys[0]} only
                </div>
              ) : (
                <Select value={form.target_key} onValueChange={(v) => setForm({ ...form, target_key: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (all configured targets)</SelectItem>
                    {aggregatorTargets.map((k) => (
                      <SelectItem key={k} value={k}>{targetLabel(k)} only</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <Label>Custom login URL (optional)</Label>
            <Input
              value={form.custom_url}
              onChange={(e) => setForm({ ...form, custom_url: e.target.value })}
              placeholder="https://…  (overrides the site's login_url)"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Login strategy</Label>
              <Select value={form.login_strategy} onValueChange={(v) => setForm({ ...form, login_strategy: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit default</SelectItem>
                  <SelectItem value="single">Single password</SelectItem>
                  <SelectItem value="multi_password">Multi-password (stop on first hit)</SelectItem>
                  <SelectItem value="all_passwords">Try every password</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Concurrency (1–5)</Label>
              <Input type="number" min={1} max={5} value={form.concurrency}
                onChange={(e) => setForm({ ...form, concurrency: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Retries on error</Label>
              <Input type="number" min={0} max={3} value={form.max_retries}
                onChange={(e) => setForm({ ...form, max_retries: Math.max(0, Math.min(3, Number(e.target.value) || 0)) })} />
            </div>
            <div className="grid gap-2">
              <Label>Label (optional)</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. nightly batch" />
            </div>
          </div>

          <RunProxyOverride value={form.proxy} onChange={(proxy) => setForm({ ...form, proxy })} proxies={proxies} />

          {effectiveCount === 0 ? (
            <p className="text-xs text-amber-300">
              No credentials saved for <span className="font-mono">{form.site_key || "—"}</span>. Add or import some first.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Will queue <span className="font-mono text-foreground">{effectiveCount}</span> credential
              {effectiveCount === 1 ? "" : "s"} for <span className="font-mono text-foreground">{form.site_key || "—"}</span>
              {targetLocked && <> · target <span className="font-mono text-foreground">{lockedTargetLabel || lockedTargetKeys[0]}</span></>}
              .
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!form.site_key || effectiveCount === 0}>Start run</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}