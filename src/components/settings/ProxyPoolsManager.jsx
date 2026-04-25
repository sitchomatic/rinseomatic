import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Layers, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const BLANK = {
  name: "",
  description: "",
  proxy_ids: [],
  rotation_strategy: "round_robin",
  latency_threshold_ms: 500,
  failure_threshold: 3,
  auto_ban_enabled: true,
  auto_ban_triggers: ["captcha", "ip_block", "rate_limit", "403"],
  enabled: true,
};

export default function ProxyPoolsManager({ proxies = [] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(BLANK);
  const editing = !!draft.id;

  const { data: pools = [] } = useQuery({
    queryKey: ["proxy-pools"],
    queryFn: () => base44.entities.ProxyPool.list("-created_date", 100),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (d) => d.id ? base44.entities.ProxyPool.update(d.id, d) : base44.entities.ProxyPool.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proxy-pools"] });
      setDraft(BLANK);
      toast.success(editing ? "Proxy pool updated" : "Proxy pool added");
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ProxyPool.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proxy-pools"] }); toast.success("Proxy pool deleted"); },
  });

  const proxyOptions = proxies.filter((p) => p.enabled !== false);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Layers className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Proxy pools</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Group proxies and define rotation preferences for future pool-based routing and health decisions.
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{pools.length} pools</span>
      </div>

      <div className="space-y-2">
        {pools.length === 0 && (
          <div className="rounded-md border border-dashed border-border bg-card/40 py-6 text-center text-xs text-muted-foreground">
            No proxy pools yet. Create one below.
          </div>
        )}
        {pools.map((pool) => (
          <div key={pool.id} className="flex items-center gap-3 rounded-md border border-border bg-secondary/20 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                {pool.name}
                {pool.enabled === false && <span className="text-[10px] text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded px-1.5 py-0.5">disabled</span>}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground truncate">
                {(pool.proxy_ids || []).length} proxies · {pool.rotation_strategy || "round_robin"} · ban {pool.auto_ban_enabled === false ? "off" : "on"}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDraft(pool)}>Edit</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400" onClick={() => deleteMut.mutate(pool.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium flex items-center gap-1.5"><Plus className="h-3 w-3" /> {editing ? "Edit pool" : "Add pool"}</div>
          {editing && <Button variant="ghost" size="sm" className="gap-1" onClick={() => setDraft(BLANK)}><X className="h-3 w-3" /> Cancel</Button>}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <F label="Name"><Input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="AU residential pool" /></F>
          <F label="Rotation strategy">
            <Select value={draft.rotation_strategy || "round_robin"} onValueChange={(v) => setDraft({ ...draft, rotation_strategy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">Round robin</SelectItem>
                <SelectItem value="weighted">Weighted</SelectItem>
                <SelectItem value="random">Random</SelectItem>
                <SelectItem value="least_latency">Least latency</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Latency threshold (ms)"><Input type="number" value={draft.latency_threshold_ms ?? 500} onChange={(e) => setDraft({ ...draft, latency_threshold_ms: Number(e.target.value) || 0 })} /></F>
          <F label="Failure threshold"><Input type="number" value={draft.failure_threshold ?? 3} onChange={(e) => setDraft({ ...draft, failure_threshold: Number(e.target.value) || 0 })} /></F>
        </div>

        <F label="Proxy IDs" help="Comma-separated proxy IDs. Use the saved proxy list above as the source of truth.">
          <Textarea className="font-mono text-[11px]" rows={2} value={(draft.proxy_ids || []).join(", ")} onChange={(e) => setDraft({ ...draft, proxy_ids: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder={proxyOptions.map((p) => p.id).slice(0, 3).join(", ")} />
        </F>
        <F label="Auto-ban triggers" help="Comma-separated block signals that should remove or deprioritise a proxy.">
          <Input className="font-mono text-xs" value={(draft.auto_ban_triggers || []).join(", ")} onChange={(e) => setDraft({ ...draft, auto_ban_triggers: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
        </F>

        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <div className="flex items-center gap-4">
            <Toggle label="Enabled" checked={draft.enabled !== false} onChange={(v) => setDraft({ ...draft, enabled: v })} />
            <Toggle label="Auto-ban" checked={draft.auto_ban_enabled !== false} onChange={(v) => setDraft({ ...draft, auto_ban_enabled: v })} />
          </div>
          <Button size="sm" onClick={() => saveMut.mutate(draft)} disabled={!draft.name || saveMut.isPending}>{saveMut.isPending ? "Saving…" : editing ? "Save pool" : "Add pool"}</Button>
        </div>
      </div>
    </div>
  );
}

function F({ label, help, children }) {
  return <div className="grid gap-1"><Label className="text-[11px]">{label}</Label>{children}{help && <p className="text-[10px] text-muted-foreground leading-snug">{help}</p>}</div>;
}

function Toggle({ label, checked, onChange }) {
  return <label className="flex items-center gap-2 text-xs cursor-pointer"><Switch checked={checked} onCheckedChange={onChange} /> {label}</label>;
}