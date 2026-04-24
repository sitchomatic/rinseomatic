import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Network, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BLANK = { label: "", host: "", port: 8080, protocol: "http", username: "", password: "", region: "", enabled: true };

export default function ExternalProxiesManager({ proxies = [] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(BLANK);
  const editing = !!draft.id;

  const saveMut = useMutation({
    mutationFn: (d) => d.id ? base44.entities.Proxy.update(d.id, d) : base44.entities.Proxy.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proxies"] }); setDraft(BLANK); toast.success(editing ? "Proxy updated" : "Proxy added"); },
  });
  const delMut = useMutation({
    mutationFn: (id) => base44.entities.Proxy.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proxies"] }); toast.success("Proxy deleted"); },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Network className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">External proxies</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Your own HTTP / HTTPS / SOCKS5 proxies. Used only when <span className="font-mono text-foreground">Proxy mode = External</span> (set above or per run).
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {proxies.length} saved
        </span>
      </div>

      <div className="space-y-2">
        {proxies.length === 0 && (
          <div className="rounded-md border border-dashed border-border bg-card/40 py-6 text-center text-xs text-muted-foreground">
            No external proxies yet. Add one below to make the "External" proxy mode selectable.
          </div>
        )}
        {proxies.map((p) => (
          <div key={p.id}
            className={cn(
              "flex items-center gap-3 rounded-md border bg-secondary/20 px-3 py-2",
              draft.id === p.id ? "border-primary/60 ring-1 ring-primary/20" : "border-border"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                {p.label || `${p.host}:${p.port}`}
                {p.enabled === false && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded px-1.5 py-0.5">disabled</span>
                )}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground truncate">
                {p.protocol}://{p.username ? `${p.username}:•••@` : ""}{p.host}:{p.port}{p.region ? ` · ${p.region}` : ""}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDraft(p)} title="Load this proxy into the form below for editing">
              <Pencil className="h-3 w-3" /> Edit
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400"
              onClick={() => delMut.mutate(p.id)} title="Permanently delete this proxy">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium flex items-center gap-1.5">
            <Plus className="h-3 w-3" /> {editing ? "Edit proxy" : "Add proxy"}
          </div>
          {editing && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setDraft(BLANK)} title="Discard edits and reset the form">
              <X className="h-3 w-3" /> Cancel
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Label" help="Friendly name you'll see in the dropdown. Optional.">
            <Input value={draft.label || ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="My AU SOCKS5" />
          </F>
          <F label="Region" help="Informational tag (e.g. AU, US-East). Not used for routing.">
            <Input value={draft.region || ""} onChange={(e) => setDraft({ ...draft, region: e.target.value })} placeholder="AU" />
          </F>
          <F label="Protocol" help="Must match what your proxy provider supports.">
            <Select value={draft.protocol || "http"} onValueChange={(v) => setDraft({ ...draft, protocol: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="https">HTTPS</SelectItem>
                <SelectItem value="socks5">SOCKS5</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Host" help="Proxy hostname or IP address.">
            <Input value={draft.host || ""} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="proxy.example.com" className="font-mono text-xs" />
          </F>
          <F label="Port" help="Port the proxy listens on.">
            <Input type="number" value={draft.port || ""} onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 0 })} />
          </F>
          <F label="Username" help="Leave blank for open proxies.">
            <Input value={draft.username || ""} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder="optional" />
          </F>
          <F label="Password" help="Stored as-is; sent to Browserless over HTTPS.">
            <Input type="password" value={draft.password || ""} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="optional" />
          </F>
          <div className="flex items-end justify-between gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span>Enabled</span>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={draft.enabled !== false} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
                <span className="text-[11px] text-muted-foreground">
                  {draft.enabled !== false ? "Selectable" : "Hidden from dropdowns"}
                </span>
              </div>
            </label>
            <Button
              size="sm"
              onClick={() => saveMut.mutate(draft)}
              disabled={!draft.host || !draft.port || saveMut.isPending}
              title={!draft.host || !draft.port ? "Host and port are required" : editing ? "Save changes" : "Add this proxy"}
            >
              {editing ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function F({ label, help, children }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
      {help && <p className="text-[10px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}