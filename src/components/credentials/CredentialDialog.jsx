import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export default function CredentialDialog({ open, onOpenChange, sites, onSubmit }) {
  const [form, setForm] = React.useState({ username: "", password: "", site_key: "", extra_passwords: [] });
  const [extra, setExtra] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setForm({ username: "", password: "", site_key: sites?.[0]?.key || "", extra_passwords: [] });
      setExtra("");
    }
  }, [open, sites]);

  const addExtra = () => {
    const v = extra.trim();
    if (!v) return;
    if (v === form.password || form.extra_passwords.includes(v)) { setExtra(""); return; }
    setForm({ ...form, extra_passwords: [...form.extra_passwords, v] });
    setExtra("");
  };
  const removeExtra = (i) => setForm({ ...form, extra_passwords: form.extra_passwords.filter((_, x) => x !== i) });

  const submit = () => {
    if (!form.username || !form.password || !form.site_key) return;
    onSubmit(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add credential</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Site</Label>
            <Select value={form.site_key} onValueChange={(v) => setForm({ ...form, site_key: v })}>
              <SelectTrigger><SelectValue placeholder="Pick a site" /></SelectTrigger>
              <SelectContent>
                {(sites || []).map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Username / email</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Primary password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label className="flex items-center justify-between">
              Additional passwords to try
              <span className="text-[10px] font-mono text-muted-foreground">{form.extra_passwords.length}</span>
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                autoComplete="new-password"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }}
                placeholder="Another password the user may use"
              />
              <Button type="button" size="sm" variant="outline" onClick={addExtra} className="gap-1.5">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {form.extra_passwords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.extra_passwords.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-[11px] font-mono">
                    ••••{p.slice(-2)}
                    <button type="button" onClick={() => removeExtra(i)} className="text-muted-foreground hover:text-rose-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">The tester will try each password in order until one works (multi-password strategy).</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}