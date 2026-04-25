import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AddCredentialDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState({ username: "", password: "", extras: "", notes: "" });

  React.useEffect(() => {
    if (open) setForm({ username: "", password: "", extras: "", notes: "" });
  }, [open]);

  const mut = useMutation({
    mutationFn: (data) => base44.entities.Credential.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credentials"] });
      toast.success("Credential added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e?.message || "Failed to add"),
  });

  const submit = () => {
    if (!form.username.trim() || !form.password.trim()) return;
    const extras = form.extras
      .split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    mut.mutate({
      username: form.username.trim(),
      password: form.password.trim(),
      extra_passwords: extras,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add credential</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Username">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="email or username" />
          </Field>
          <Field label="Primary password">
            <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          </Field>
          <Field label="Extra passwords (optional)" help="One per line, or comma-separated. Each will be tried during 'multi' / 'all' run strategies.">
            <Textarea value={form.extras} onChange={(e) => setForm({ ...form, extras: e.target.value })} rows={3} placeholder="oldPassword1&#10;oldPassword2" className="font-mono text-xs" />
          </Field>
          <Field label="Notes (optional)">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="any context…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.username.trim() || !form.password.trim() || mut.isPending}>
            {mut.isPending ? "Adding…" : "Add credential"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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