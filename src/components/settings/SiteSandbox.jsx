import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, FlaskConical } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatMs } from "@/lib/sites";

// "Test selectors" sandbox — runs a one-off `testCredential` against the
// given site so you can verify the selectors work, without creating a
// throwaway credential or queueing a run. Uses a dummy username/password
// by default; you can edit them.
export default function SiteSandbox({ open, onOpenChange, site }) {
  const [username, setUsername] = React.useState("sandbox@example.com");
  const [password, setPassword] = React.useState("not-a-real-password");
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (open) { setResult(null); }
  }, [open]);

  const run = async () => {
    if (!site) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("testCredential", {
        username,
        password,
        site_key: site.key,
        strategy: "single",
      });
      setResult(res?.data || res);
    } catch (e) {
      setResult({ status: "error", error_message: e.message });
    } finally {
      setRunning(false);
    }
  };

  if (!site) return null;

  const status = result?.status;
  const Icon =
    status === "working" ? CheckCircle2 :
    status === "failed" ? XCircle :
    status === "error" ? AlertTriangle : null;
  const accent =
    status === "working" ? "text-emerald-300" :
    status === "failed" ? "text-rose-300" :
    status === "error" ? "text-amber-300" : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Test selectors · {site.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Submits a real login attempt with the values below. The point isn't to
            log in — it's to confirm that the runner can find the username, password,
            and submit selectors. A "failed" result with no error means the
            selectors are correct; the credentials are simply wrong.
          </p>

          <div className="grid gap-2">
            <Label className="text-xs">Sandbox username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">Sandbox password</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono text-xs" />
          </div>

          {result && (
            <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                {Icon && <Icon className={`h-4 w-4 ${accent}`} />}
                <span className={`font-medium ${accent}`}>{status || "unknown"}</span>
                {result.elapsed_ms != null && (
                  <span className="ml-auto text-[11px] font-mono text-muted-foreground">{formatMs(result.elapsed_ms)}</span>
                )}
              </div>
              {result.error_message && (
                <div className="text-xs font-mono text-rose-300/90 break-all">{result.error_message}</div>
              )}
              {result.final_url && (
                <div className="text-[11px] font-mono text-muted-foreground break-all">→ {result.final_url}</div>
              )}
              {status === "failed" && !result.error_message && (
                <div className="text-[11px] text-muted-foreground">
                  Selectors found and form submitted. Login was rejected (expected for sandbox creds).
                </div>
              )}
              {status === "error" && result.error_message?.toLowerCase().includes("username field") && (
                <div className="text-[11px] text-amber-300">
                  Selector mismatch — the username field couldn't be found. Update the username selector.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={run} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
            {running ? "Testing…" : "Run test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}