import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Settings2, ChevronDown, ChevronUp } from "lucide-react";

// Small, collapsible advanced section for overriding global defaults on a single run.
export default function RunProxyOverride({ value, onChange, proxies = [] }) {
  const [open, setOpen] = React.useState(false);
  const v = value || {};
  const set = (k, val) => onChange({ ...v, [k]: val });

  return (
    <div className="rounded-md border border-border bg-secondary/20">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Proxy & browser overrides</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          {open ? "hide" : "optional"}
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/60">
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Field label="Proxy mode">
              <Select value={v.proxy_mode || "inherit"} onValueChange={(val) => set("proxy_mode", val === "inherit" ? undefined : val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit global</SelectItem>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="datacenter">Datacenter</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Country">
              <Input value={v.country_code || ""} onChange={(e) => set("country_code", e.target.value.toLowerCase() || undefined)} placeholder="inherit" className="font-mono" />
            </Field>
          </div>
          {v.proxy_mode === "residential" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="City (optional)">
                <Input value={v.proxy_city || ""} onChange={(e) => set("proxy_city", e.target.value.toLowerCase() || undefined)} className="font-mono" />
              </Field>
              <Field label="Preset">
                <Select value={v.proxy_preset || "none"} onValueChange={(val) => set("proxy_preset", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="px_gov01">px_gov01</SelectItem>
                    <SelectItem value="px_ipv6">px_ipv6</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Toggle label="Sticky IP" checked={v.proxy_sticky} onChange={(val) => set("proxy_sticky", val)} />
              <Toggle label="Locale match" checked={v.proxy_locale_match} onChange={(val) => set("proxy_locale_match", val)} />
            </div>
          )}
          {v.proxy_mode === "external" && (
            <Field label="External proxy">
              <Select value={v.external_proxy_id || ""} onValueChange={(val) => set("external_proxy_id", val || undefined)}>
                <SelectTrigger><SelectValue placeholder="Pick a proxy…" /></SelectTrigger>
                <SelectContent>
                  {proxies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label || `${p.host}:${p.port}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
    </div>
  );
}
function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <span className="text-xs">{label}</span>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </label>
  );
}