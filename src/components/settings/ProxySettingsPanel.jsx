import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Globe, Save, Info } from "lucide-react";
import { toast } from "sonner";

const DEFAULTS = {
  singleton_key: "global",
  provider: "browserless",
  browserless_region: "production-sfo",
  proxy_mode: "residential",
  country_code: "au",
  proxy_city: "",
  proxy_sticky: true,
  proxy_locale_match: true,
  proxy_preset: "none",
  external_proxy_id: "",
  stealth: true,
  headless: true,
  block_ads: true,
  block_consent_modals: true,
  timeout_ms: 60000,
  slow_mo_ms: 0,
  user_agent: "",
  viewport_width: 1366,
  viewport_height: 768,
  default_login_strategy: "multi_password",
};

export default function ProxySettingsPanel({ proxies = [] }) {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.list("-created_date", 1),
  });
  const existing = rows[0];
  const [form, setForm] = React.useState(DEFAULTS);

  React.useEffect(() => {
    if (existing) setForm({ ...DEFAULTS, ...existing });
  }, [existing]);

  const saveMut = useMutation({
    mutationFn: async (d) => existing
      ? base44.entities.AppSettings.update(existing.id, d)
      : base44.entities.AppSettings.create({ ...d, singleton_key: "global" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["app-settings"] }); toast.success("Defaults saved — new runs will use these unless overridden."); },
    onError: (e) => toast.error(e?.message || "Failed to save"),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return null;

  const isResidential = form.proxy_mode === "residential";
  const isExternal = form.proxy_mode === "external";
  const enabledExternalProxies = proxies.filter((p) => p.enabled !== false);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-6">
      <div className="flex items-start gap-2">
        <Globe className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Global defaults</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Applied to every new run. Each run can override these in the "Proxy & browser overrides" section of the run dialog.
          </div>
        </div>
      </div>

      <Section title="Provider" desc="Which automation service runs the browser.">
        <Grid cols={2}>
          <Field label="Provider" help="Currently only Browserless is implemented. ScrapingBee support has been removed from the runner.">
            <Select value="browserless" disabled>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="browserless">Browserless</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Browserless region" help="Datacenter that hosts the headless browser. Pick the one closest to the target site for lower latency.">
            <Select value={form.browserless_region} onValueChange={(v) => set("browserless_region", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production-sfo">SFO · US West</SelectItem>
                <SelectItem value="production-lon">London · UK</SelectItem>
                <SelectItem value="production-ams">Amsterdam · EU</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Grid>
      </Section>

      <Section title="Proxy" desc="How the browser's traffic is routed. Only the fields relevant to the selected mode are shown.">
        <Field label="Mode" help="Residential = rotating real-user IPs via Browserless. Datacenter = Browserless' own IP (fastest, lowest disguise). External = one of your own proxies below. None = direct connection (skipping proxy entirely).">
          <Select value={form.proxy_mode} onValueChange={(v) => set("proxy_mode", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="residential">Residential (Browserless rotating IPs)</SelectItem>
              <SelectItem value="datacenter">Datacenter (Browserless IP, no proxy)</SelectItem>
              <SelectItem value="external">External proxy (pick one below)</SelectItem>
              <SelectItem value="none">None (direct)</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {isResidential && (
          <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Residential options · applied only when mode = Residential
            </div>
            <Grid cols={2}>
              <Field label="Country (ISO-2)" help="Restricts the residential pool to this country. Leave blank to use any country.">
                <Input value={form.country_code || ""} onChange={(e) => set("country_code", e.target.value.toLowerCase())} placeholder="au" className="font-mono" />
              </Field>
              <Field label="City (Scale plan only)" help="Further narrows the pool to a city. Ignored on plans without Scale add-on.">
                <Input value={form.proxy_city || ""} onChange={(e) => set("proxy_city", e.target.value.toLowerCase())} placeholder="sydney" className="font-mono" />
              </Field>
              <Field label="Preset" help="Browserless-tuned pools for specific target types. 'None' = generic residential pool.">
                <Select value={form.proxy_preset} onValueChange={(v) => set("proxy_preset", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (generic pool)</SelectItem>
                    <SelectItem value="px_gov01">px_gov01 · government sites</SelectItem>
                    <SelectItem value="px_ipv6">px_ipv6 · Google domains</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div />
              <Toggle
                label="Sticky IP"
                help="Keeps the same IP for the whole session (needed by some login flows). When off, IP rotates on every request."
                checked={form.proxy_sticky}
                onChange={(v) => set("proxy_sticky", v)}
              />
              <Toggle
                label="Match browser locale to proxy country"
                help="Sets Accept-Language and timezone to match the proxy's country, so the site sees a consistent identity."
                checked={form.proxy_locale_match}
                onChange={(v) => set("proxy_locale_match", v)}
              />
            </Grid>
          </div>
        )}

        {isExternal && (
          <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              External proxy · applied only when mode = External
            </div>
            <Field
              label="Which proxy"
              help={
                enabledExternalProxies.length === 0
                  ? "No enabled proxies. Add one in 'External proxies' below."
                  : "Runs will route through this proxy. Add/edit them in 'External proxies' below."
              }
            >
              <Select
                value={form.external_proxy_id || ""}
                onValueChange={(v) => set("external_proxy_id", v)}
                disabled={enabledExternalProxies.length === 0}
              >
                <SelectTrigger><SelectValue placeholder={enabledExternalProxies.length === 0 ? "Add a proxy below first" : "Pick a proxy…"} /></SelectTrigger>
                <SelectContent>
                  {enabledExternalProxies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label || `${p.host}:${p.port}`}{p.region ? ` · ${p.region}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        {(form.proxy_mode === "datacenter" || form.proxy_mode === "none") && (
          <div className="rounded-md border border-dashed border-border/60 bg-secondary/10 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            {form.proxy_mode === "datacenter"
              ? "Using Browserless datacenter IPs. Country / city / preset are not used in this mode."
              : "No proxy — traffic goes directly from Browserless. Country / city / preset are not used in this mode."}
          </div>
        )}
      </Section>

      <Section title="Browser behaviour" desc="Applied to every Browserless session.">
        <Grid cols={2}>
          <Toggle
            label="Stealth mode"
            help="Patches common anti-bot fingerprints (navigator.webdriver, plugins, etc.). Turn off only to debug detection-related failures."
            checked={form.stealth}
            onChange={(v) => set("stealth", v)}
          />
          <Toggle
            label="Headless"
            help="Runs the browser without a visible UI. Turn off for debugging via Browserless live-view."
            checked={form.headless}
            onChange={(v) => set("headless", v)}
          />
          <Toggle
            label="Block ads"
            help="Drops ad/tracker requests — faster page loads, but can break sites that gate login behind consent."
            checked={form.block_ads}
            onChange={(v) => set("block_ads", v)}
          />
          <Toggle
            label="Block consent modals"
            help="Auto-dismisses GDPR/cookie banners that would otherwise cover the login form."
            checked={form.block_consent_modals}
            onChange={(v) => set("block_consent_modals", v)}
          />
        </Grid>
        <Grid cols={3}>
          <Field label="Timeout (ms)" help="Max duration for one credential test. If exceeded, the test is marked 'error'.">
            <Input type="number" value={form.timeout_ms} onChange={(e) => set("timeout_ms", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Slow-mo (ms)" help="Delay between browser actions (typing, clicks). Makes the session look more human; 0 = as fast as possible.">
            <Input type="number" value={form.slow_mo_ms} onChange={(e) => set("slow_mo_ms", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Default login strategy" help="How multiple passwords per credential are tried. Runs can override this in the run dialog.">
            <Select value={form.default_login_strategy} onValueChange={(v) => set("default_login_strategy", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single — only the primary password</SelectItem>
                <SelectItem value="multi_password">Multi — stop on first working password</SelectItem>
                <SelectItem value="all_passwords">All — try every password (slower)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Viewport width (px)" help="Browser window width. Some sites render different login forms on mobile widths.">
            <Input type="number" value={form.viewport_width} onChange={(e) => set("viewport_width", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Viewport height (px)" help="Browser window height. Pair with width to match a specific device profile.">
            <Input type="number" value={form.viewport_height} onChange={(e) => set("viewport_height", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Custom User-Agent" help="Overrides the browser's User-Agent string. Leave blank to use Browserless' default (recommended).">
            <Input value={form.user_agent || ""} onChange={(e) => set("user_agent", e.target.value)} className="font-mono text-xs" placeholder="leave blank for default" />
          </Field>
        </Grid>
      </Section>

      <div className="flex items-center justify-between pt-3 border-t border-border/60">
        <div className="text-[11px] text-muted-foreground">
          Changes only affect <span className="text-foreground">new</span> runs — in-flight runs keep their original settings.
        </div>
        <Button size="sm" onClick={() => saveMut.mutate(form)} className="gap-2" disabled={saveMut.isPending}>
          <Save className="h-3.5 w-3.5" /> {saveMut.isPending ? "Saving…" : "Save defaults"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, desc, children }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
        {desc && <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Grid({ cols = 2, children }) {
  return <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-3`}>{children}</div>;
}
function Field({ label, help, children }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {help && <p className="text-[11px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}
function Toggle({ label, help, checked, onChange }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-sm">{label}</span>
        <Switch checked={!!checked} onCheckedChange={onChange} />
      </label>
      {help && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{help}</p>}
    </div>
  );
}