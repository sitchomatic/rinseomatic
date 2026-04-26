import React from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Loader2, CheckCircle2, XCircle, Globe, MapPin, Server } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DiagnosticsPanel() {
  const [result, setResult] = React.useState(null);
  const [proxyMode, setProxyMode] = React.useState("default");
  const [countryCode, setCountryCode] = React.useState("");
  const mut = useMutation({
    mutationFn: () => base44.functions.invoke("runDiagnostics", {
      override: proxyMode === "default" ? undefined : {
        proxy_mode: proxyMode,
        country_code: countryCode.trim() || undefined,
      },
    }),
    onSuccess: (res) => setResult(res?.data || res),
    onError: (e) => setResult({ ok: false, error: e?.response?.data?.error || e.message }),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Activity className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Network diagnostics</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Fires a probe through ScrapingBee with the current global proxy settings, hits an IP-info endpoint, and reports what the target site would actually see. Costs 1–25 credits depending on proxy tier.
          </div>
        </div>
        <Button size="sm" className="gap-1.5 h-7" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
          {mut.isPending ? "Probing…" : "Run probe"}
        </Button>
      </div>

      <div className="grid sm:grid-cols-[1fr_160px] gap-3 rounded-md border border-border bg-background/40 p-3">
        <Field label="Probe proxy mode" help="Default uses global settings.">
          <Select value={proxyMode} onValueChange={setProxyMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="classic">Classic</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="stealth">Stealth</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Country" help="Premium / stealth only.">
          <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toLowerCase())} placeholder="au" className="font-mono text-xs" />
        </Field>
      </div>

      {result && (
        <div
          className={cn(
            "rounded-md border px-3 py-3 space-y-2 text-xs",
            result.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {result.ok ? (
              <><CheckCircle2 className="h-4 w-4 text-emerald-300" /> <span className="text-emerald-300">Probe successful</span></>
            ) : (
              <><XCircle className="h-4 w-4 text-rose-300" /> <span className="text-rose-300">Probe failed</span></>
            )}
            {result.total_elapsed_ms != null && (
              <span className="ml-auto text-muted-foreground font-mono text-[11px]">{result.total_elapsed_ms}ms total</span>
            )}
          </div>

          {result.ok ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 font-mono">
              <Row icon={Globe} label="Public IP" value={result.ip} />
              <Row icon={MapPin} label="Country" value={result.country ? `${result.country} (requested ${result.country_requested?.toUpperCase()})` : "—"} mismatch={result.country && result.country_requested && result.country.toLowerCase() !== result.country_requested.toLowerCase()} />
              <Row icon={MapPin} label="City" value={result.city || "—"} />
              <Row icon={Server} label="ASN / Org" value={result.org || result.asn || "—"} />
              <Row label="Provider" value="ScrapingBee" />
              <Row label="Proxy tier" value={result.proxy_mode} />
              {result.probe_elapsed_ms != null && <Row label="Probe time" value={`${result.probe_elapsed_ms}ms`} />}
            </div>
          ) : (
            <div className="font-mono text-[11px] text-rose-300 break-all">{result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, help, children }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
      {help && <p className="text-[10px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}

function Row({ icon: Icon, label, value, mismatch }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground shrink-0" />}
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={cn("truncate", mismatch ? "text-amber-300" : "text-foreground")} title={mismatch ? "Country doesn't match request — proxy may not be honouring geo target" : undefined}>
        {value}
      </span>
    </div>
  );
}