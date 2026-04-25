import React from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import { cn } from "@/lib/utils";

// Inline reveal/copy control for credential passwords.
// Click reveal toggles plaintext; click copy puts the password on the clipboard.
// The container stops click propagation so it doesn't toggle the row's checkbox.
export default function PasswordCell({ password, copyKey }) {
  const [revealed, setRevealed] = React.useState(false);
  const { copy, copiedKey } = useCopyToClipboard();
  const value = password || "";
  if (!value) return <span className="text-muted-foreground">—</span>;

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <div
      className="inline-flex items-center gap-1.5 min-w-0"
      onClick={stop}
    >
      <span className="truncate min-w-0 max-w-[14ch] text-muted-foreground">
        {revealed ? value : "•".repeat(Math.min(8, value.length))}
      </span>
      <button
        type="button"
        onClick={(e) => { stop(e); setRevealed((v) => !v); }}
        title={revealed ? "Hide" : "Reveal"}
        className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
      >
        {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={(e) => { stop(e); copy(value, copyKey, "Password copied"); }}
        title="Copy password"
        className={cn(
          "shrink-0 h-6 w-6 inline-flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground",
          copiedKey === copyKey && "text-emerald-300"
        )}
      >
        {copiedKey === copyKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}