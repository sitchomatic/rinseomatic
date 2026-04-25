import React from "react";
import { toast } from "sonner";

// Works in modern browsers and falls back to a hidden textarea + execCommand
// for Safari / insecure (http://) contexts where navigator.clipboard is missing.
async function writeClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {/* fall through */}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = React.useState(null);
  const timerRef = React.useRef(null);

  const copy = React.useCallback(async (text, key, label = "Copied") => {
    const value = String(text ?? "");
    const ok = await writeClipboard(value);
    if (ok) {
      setCopiedKey(key || value);
      if (label) toast.success(label, { duration: 1200 });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedKey(null), 1400);
    } else {
      toast.error("Could not copy");
    }
  }, []);

  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return { copy, copiedKey };
}