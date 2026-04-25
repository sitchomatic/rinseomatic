import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StatusPill from "@/components/shared/StatusPill";
import { formatMs } from "@/lib/sites";
import { format } from "date-fns";
import { ExternalLink, Copy, Check } from "lucide-react";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";

// Pull "[Class] message" tag out of error_message.
function splitTag(msg) {
  if (!msg) return { label: null, message: null };
  const m = msg.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (m) return { label: m[1], message: m[2] };
  return { label: null, message: msg };
}

// Modal showing the full detail for a single TestResult row, including the
// untruncated error message, full screenshot inline, and (when available) the
// password that worked. Opens from a click in ResultsTable.
export default function ResultDetailDialog({ result, onOpenChange }) {
  const open = !!result;
  const { copy, copiedKey } = useCopyToClipboard();
  if (!result) return null;
  const { label, message } = splitTag(result.error_message);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(null)}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm break-all">{result.username}</span>
            <StatusPill status={result.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Meta label="Attempts" value={result.attempts || 0} />
            <Meta label="Elapsed" value={formatMs(result.elapsed_ms)} />
            <Meta label="Marker" value={result.success_marker_found ? "✓ found" : "—"} />
            <Meta label="Tested" value={result.tested_at ? format(new Date(result.tested_at), "MMM d HH:mm:ss") : "—"} />
          </div>

          {result.working_password && (
            <Section title="Working password">
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                <code className="flex-1 font-mono text-xs text-emerald-200 break-all">{result.working_password}</code>
                <button
                  onClick={() => copy(result.working_password, `wp-${result.id}`, "Password copied")}
                  className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded hover:bg-emerald-500/10 text-emerald-300"
                  title="Copy password"
                >
                  {copiedKey === `wp-${result.id}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </Section>
          )}

          {result.final_url && (
            <Section title="Final URL">
              <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
                <code className="flex-1 font-mono text-[11px] break-all">{result.final_url}</code>
                <a
                  href={result.final_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                  title="Open"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </Section>
          )}

          {(label || message) && (
            <Section title="Error detail">
              <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 space-y-1.5">
                {label && (
                  <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-mono">
                    {label}
                  </span>
                )}
                {message && <p className="font-mono text-[11px] text-muted-foreground whitespace-pre-wrap break-words">{message}</p>}
              </div>
            </Section>
          )}

          {result.screenshot_url && (
            <Section title="Screenshot">
              <a href={result.screenshot_url} target="_blank" rel="noopener noreferrer" className="block rounded-md border border-border overflow-hidden bg-black">
                <img src={result.screenshot_url} alt="run screenshot" className="w-full h-auto block" />
              </a>
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">{title}</div>
      {children}
    </div>
  );
}