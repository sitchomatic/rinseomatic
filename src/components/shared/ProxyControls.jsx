import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

const PROXY_TYPES = [
  { value: "none", label: "No proxy (direct)" },
  { value: "datacenter", label: "Datacenter (cheapest)" },
  { value: "premium", label: "Premium residential" },
  { value: "stealth", label: "Stealth (best bypass)" },
  { value: "external", label: "External proxy" },
];

const COUNTRIES = [
  { value: "au", label: "🇦🇺 Australia" },
  { value: "us", label: "🇺🇸 United States" },
  { value: "gb", label: "🇬🇧 United Kingdom" },
  { value: "ca", label: "🇨🇦 Canada" },
  { value: "nz", label: "🇳🇿 New Zealand" },
  { value: "de", label: "🇩🇪 Germany" },
  { value: "fr", label: "🇫🇷 France" },
  { value: "nl", label: "🇳🇱 Netherlands" },
  { value: "sg", label: "🇸🇬 Singapore" },
  { value: "jp", label: "🇯🇵 Japan" },
];

export default function ProxyControls({ value, onChange, externalProxies = [], compact = false }) {
  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });
  const type = v.type || "stealth";
  const showCountry = type !== "none" && type !== "external";
  const showExternal = type === "external";

  return (
    <div className={compact ? "grid gap-3" : "grid gap-3"}>
      <div className="grid gap-1.5">
        <Label className="text-xs">Proxy type</Label>
        <Select value={type} onValueChange={(val) => set({ type: val })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PROXY_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {showCountry && (
        <div className="grid gap-1.5">
          <Label className="text-xs">Country</Label>
          <Select value={v.country_code || "au"} onValueChange={(val) => set({ country_code: val })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {showExternal && (
        <div className="grid gap-1.5">
          <Label className="text-xs">External proxy</Label>
          {externalProxies.length === 0 ? (
            <p className="text-xs text-amber-300">No external proxies configured. Add one in Settings → External proxies.</p>
          ) : (
            <Select value={v.external_proxy_id || ""} onValueChange={(val) => set({ external_proxy_id: val })}>
              <SelectTrigger><SelectValue placeholder="Choose a proxy..." /></SelectTrigger>
              <SelectContent>
                {externalProxies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label || `${p.host}:${p.port || ""}`} {p.region ? `· ${p.region}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}