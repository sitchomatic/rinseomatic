import React from "react";
import { toast } from "sonner";

export function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = React.useState(null);
  const timerRef = React.useRef(null);

  const copy = React.useCallback(async (text, key, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(String(text ?? ""));
      setCopiedKey(key || text);
      if (label) toast.success(label, { duration: 1200 });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedKey(null), 1400);
    } catch (_) {
      toast.error("Could not copy");
    }
  }, []);

  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return { copy, copiedKey };
}