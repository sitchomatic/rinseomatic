import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight, FlaskConical, XCircle } from "lucide-react";

export default function SiteWizardDialog({ open, onOpenChange, onSave }) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState({
    key: "", label: "", login_url: "",
    username_selector: "input[type='email'], input[name='username']",
    password_selector: "input[type='password']",
    submit_selector: "button[type='submit']",
    success_selector: ".ol-alert__content.ol-alert__content--status_success",
    wait_after_submit_ms: 3500,
    enabled: true
  });
  const [username, setUsername] = useState("sandbox@example.com");
  const [password, setPassword] = useState("sandbox123!");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setResult(null);
      setDraft({
        key: "", label: "", login_url: "",
        username_selector: "input[type='email'], input[name='username']",
        password_selector: "input[type='password']",
        submit_selector: "button[type='submit']",
        success_selector: ".ol-alert__content.ol-alert__content--status_success",
        wait_after_submit_ms: 3500,
        enabled: true
      });
    }
  }, [open]);

  const runValidation = async () => {
    setValidating(true);
    setResult(null);
    let tempSiteId = null;
    try {
      const tempKey = draft.key + "-draft";
      const created = await base44.entities.Site.create({ ...draft, key: tempKey, enabled: false });
      tempSiteId = created.id;

      const res = await base44.functions.invoke("testCredential", {
        username,
        password,
        site_key: tempKey,
        strategy: "single",
      });

      await base44.entities.Site.delete(tempSiteId);
      
      setResult(res?.data || res);
    } catch (e) {
      if (tempSiteId) await base44.entities.Site.delete(tempSiteId).catch(() => {});
      setResult({ status: "error", error_message: e.message });
    } finally {
      setValidating(false);
    }
  };

  const handleSave = () => {
    onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add New Site Wizard</DialogTitle>
        </DialogHeader>
        
        {step === 1 && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">Step 1: Configure site details and selectors.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs">Key (slug)</Label>
                <Input value={draft.key} onChange={(e) => setDraft({...draft, key: e.target.value})} className="text-xs" placeholder="e.g. joe" />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Label</Label>
                <Input value={draft.label} onChange={(e) => setDraft({...draft, label: e.target.value})} className="text-xs" placeholder="e.g. Joe Fortune" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Login URL</Label>
              <Input value={draft.login_url} onChange={(e) => setDraft({...draft, login_url: e.target.value})} className="text-xs" placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs">Username Selector</Label>
                <Input value={draft.username_selector} onChange={(e) => setDraft({...draft, username_selector: e.target.value})} className="font-mono text-xs" />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Password Selector</Label>
                <Input value={draft.password_selector} onChange={(e) => setDraft({...draft, password_selector: e.target.value})} className="font-mono text-xs" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Submit Selector</Label>
              <Input value={draft.submit_selector} onChange={(e) => setDraft({...draft, submit_selector: e.target.value})} className="font-mono text-xs" />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Success Selector</Label>
              <Input value={draft.success_selector} onChange={(e) => setDraft({...draft, success_selector: e.target.value})} className="font-mono text-xs" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">Step 2: Validate selectors using headless browser.</p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="grid gap-2">
                <Label className="text-xs">Test Username</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} className="font-mono text-xs" />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Test Password</Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono text-xs" />
              </div>
            </div>
            
            <Button onClick={runValidation} disabled={validating} className="w-full gap-2" variant="secondary">
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              {validating ? "Running headless validation..." : "Validate Selectors"}
            </Button>

            {result && (
              <div className="rounded-md border border-border bg-secondary/20 p-4 space-y-2 mt-4 max-h-[40vh] overflow-y-auto thin-scroll">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {result.status === "working" ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> :
                   result.status === "failed" ? <XCircle className="h-4 w-4 text-rose-300" /> :
                   <AlertTriangle className="h-4 w-4 text-amber-300" />}
                  <span className={result.status === "working" ? "text-emerald-300" : result.status === "failed" ? "text-rose-300" : "text-amber-300"}>
                    {result.status.toUpperCase()}
                  </span>
                </div>
                {result.error_message && <div className="text-xs font-mono text-rose-300/90 break-all">{result.error_message}</div>}
                {result.screenshot_url && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Headless Preview:</p>
                    <img src={result.screenshot_url} alt="Headless preview" className="w-full rounded border border-border/50" />
                  </div>
                )}
                {result.status === "failed" && (
                  <div className="text-[11px] text-muted-foreground mt-2">
                    Selectors worked perfectly! Login was rejected because sandbox credentials are not real accounts. This means you are safe to save.
                  </div>
                )}
                {result.status === "error" && (
                  <div className="text-[11px] text-amber-300 mt-2">
                    Selector mismatch. Check the error message and adjust the selectors in Step 1.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => setStep(2)} disabled={!draft.key || !draft.label || !draft.login_url} className="gap-2">
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={handleSave} disabled={!result || result.status === "error"} className="gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" /> Save Site
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}