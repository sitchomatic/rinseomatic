import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Server, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { cn } from "@/lib/utils";

const BLANK = {
  label: "", host: "", port: 0, protocol: "http",
  username: "", password: "", region: "", enabled: true,
};

export default function ExternalProxiesCard() {
  const qc = useQueryClient();
  const { data: proxies = [] } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => base44.entities.Proxy.list("-created_date", 100),
  });

  const [draft, setDraft] = React.useState(BLANK);
  const [confirmDel, setConfirmDel] = React.useState(null);

  const saveMut = useMutation({
    mutationFn: async (d) => {
      const payload = { ...d, port: Number(d.port) || 0 };
      if (d.id) return base44.entities.Proxy.update(d.id, payload);
      return base44.entities.Proxy.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proxies"] });
      setDraft(BLANK);
      toast.success("Proxy saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Proxy.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proxies"] }); toast.success("Proxy deleted"); },
  });

  const editing = !!draft.id;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-primary" />
        <div className="text-sm font-medium">External proxies</div>
        <span className="text-muted-foreground font-mono text-xs ml-auto">{proxies.length}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Your own HTTP/SOCKS5 proxies. Used when proxy type is set to "External".
      </p>

      {proxies.length > 0 && (
        <div className="space-y-2">
          {proxies.map((p) => (
            <div
              key={p.id}
              className={cn(
                "rounded-lg border bg-background/40 p-3",
                draft.id === p.id ? "border-primary/60 ring-1 ring-primary/20" : "border-border"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {p.label || `${p.host}:${p.port || ""}`}
                    {p.enabled === false && (
                      <span className="text-[10px] font-mono uppercase text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded px-1.5 py-0.5">off</span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground truncate">
                    {p.protocol || "http"}://{p.host}{p.port ? `:${p.port}` : ""}
                    {p.region ? ` · ${p.region}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setDraft(p)}>Edit</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                    onClick={() => setConfirmDel(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-primary" />
          <div className="text-xs font-medium">{editing ? "Edit proxy" : "Add proxy"}</div>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={draft.label || ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="My AU residential" />
          </div>
          <div className="grid grid-cols-[1fr_110px_120px] gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Host</Label>
              <Input className="font-mono text-xs" value={draft.host || ""} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="proxy.example.com" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Port</Label>
              <Input className="font-mono text-xs" type="number" value={draft.port || ""} onChange={(e) => setDraft({ ...draft, port: e.target.value })} placeholder="8080" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Protocol</Label>
              <Select value={draft.protocol || "http"} onValueChange={(v) => setDraft({ ...draft, protocol: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="https">https</SelectItem>
                  <SelectItem value="socks5">socks5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Username (optional)</Label>
              <Input className="font-mono text-xs" value={draft.username || ""} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Password (optional)</Label>
              <Input className="font-mono text-xs" type="password" value={draft.password || ""} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Region (optional)</Label>
            <Input value={draft.region || ""} onChange={(e) => setDraft({ ...draft, region: e.target.value })} placeholder="Sydney" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Switch checked={draft.enabled !== false} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
              <span className="text-xs text-muted-foreground">Enabled</span>
            </div>
            <div className="flex gap-2">
              {editing && <Button variant="outline" size="sm" onClick={() => setDraft(BLANK)}>Cancel</Button>}
              <Button size="sm" onClick={() => saveMut.mutate(draft)} disabled={!draft.host || !draft.port}>
                {editing ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title="Delete proxy?"
        description={confirmDel ? `${confirmDel.label || confirmDel.host} will be removed.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirmDel) deleteMut.mutate(confirmDel.id); setConfirmDel(null); }}
      />
    </div>
  );
}