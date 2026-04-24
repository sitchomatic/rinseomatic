import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Globe, Save } from "lucide-react";
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
  capture_screenshots: false,
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["app-settings"] }); toast.success("Defaults saved"); },
    onError: (e) => toast.error(e?.message || "Failed to save"),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <div className="text-sm font-medium">Global defaults</div>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          used unless a run overrides
        </span>
      </div>

      <Section title="Provider">
        <Grid cols={2}>
          <Field label="Provider">
            <Select value={form.provider} onValueChange={(v) => set("provider", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="browserless">Browserless</SelectItem>
                <SelectItem value="scrapingbee">ScrapingBee (legacy)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Browserless region">
            <Select value={form.browserless_region} onValueChange={(v) => set("browserless_region", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production-sfo">SFO (US West)</SelectItem>
                <SelectItem value="production-lon">London (UK)</SelectItem>
                <SelectItem value="production-ams">Amsterdam (EU)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Grid>
      </Section>

      <Section title="Proxy">
        <Grid cols={2}>
          <Field label="Mode">
            <Select value={form.proxy_mode} onValueChange={(v) => set("proxy_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="residential">Residential (Browserless)</SelectItem>
                <SelectItem value="datacenter">Datacenter (no proxy)</SelectItem>
                <SelectItem value="external">External proxy</SelectItem>
                <SelectItem value="none">None (direct)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Country (ISO)">
            <Input value={form.country_code || ""} onChange={(e) => set("country_code", e.target.value.toLowerCase())} placeholder="au" className="font-mono" />
          </Field>
          <Field label="City (Scale plan only)">
            <Input value={form.proxy_city || ""} onChange={(e) => set("proxy_city", e.target.value.toLowerCase())} placeholder="sydney" className="font-mono" />
          </Field>
          <Field label="Preset">
            <Select value={form.proxy_preset} onValueChange={(v) => set("proxy_preset", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="px_gov01">px_gov01 (govt sites)</SelectItem>
                <SelectItem value="px_ipv6">px_ipv6 (Google domains)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Grid>
        {form.proxy_mode === "external" && (
          <Field label="External proxy">
            <Select value={form.external_proxy_id || ""} onValueChange={(v) => set("external_proxy_id", v)}>
              <SelectTrigger><SelectValue placeholder="Pick one below…" /></SelectTrigger>
              <SelectContent>
                {proxies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label || `${p.host}:${p.port}`} {p.region ? `· ${p.region}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Grid cols={2}>
          <Toggle label="Sticky IP" checked={form.proxy_sticky} onChange={(v) => set("proxy_sticky", v)} />
          <Toggle label="Match browser locale to proxy country" checked={form.proxy_locale_match} onChange={(v) => set("proxy_locale_match", v)} />
        </Grid>
      </Section>

      <Section title="Browser behaviour">
        <Grid cols={2}>
          <Toggle label="Stealth mode" checked={form.stealth} onChange={(v) => set("stealth", v)} />
          <Toggle label="Headless" checked={form.headless} onChange={(v) => set("headless", v)} />
          <Toggle label="Block ads" checked={form.block_ads} onChange={(v) => set("block_ads", v)} />
          <Toggle label="Block consent modals" checked={form.block_consent_modals} onChange={(v) => set("block_consent_modals", v)} />
        </Grid>
        <Grid cols={3}>
          <Field label="Timeout (ms)">
            <Input type="number" value={form.timeout_ms} onChange={(e) => set("timeout_ms", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Slow-mo (ms)">
            <Input type="number" value={form.slow_mo_ms} onChange={(e) => set("slow_mo_ms", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Default login strategy">
            <Select value={form.default_login_strategy} onValueChange={(v) => set("default_login_strategy", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single password</SelectItem>
                <SelectItem value="multi_password">Try passwords until one works</SelectItem>
                <SelectItem value="all_passwords">Try every password</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Viewport width"><Input type="number" value={form.viewport_width} onChange={(e) => set("viewport_width", Number(e.target.value) || 0)} /></Field>
          <Field label="Viewport height"><Input type="number" value={form.viewport_height} onChange={(e) => set("viewport_height", Number(e.target.value) || 0)} /></Field>
          <Field label="Custom User-Agent (optional)">
            <Input value={form.user_agent || ""} onChange={(e) => set("user_agent", e.target.value)} className="font-mono text-xs" />
          </Field>
        </Grid>
      </Section>

      <div className="flex justify-end pt-2 border-t border-border/60">
        <Button size="sm" onClick={() => saveMut.mutate(form)} className="gap-2">
          <Save className="h-3.5 w-3.5" /> Save defaults
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Grid({ cols = 2, children }) {
  return <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-3`}>{children}</div>;
}
function Field({ label, children }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2 cursor-pointer">
      <span className="text-sm">{label}</span>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </label>
  );
}