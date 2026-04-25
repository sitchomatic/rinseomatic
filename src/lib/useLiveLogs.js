import React from "react";
import { base44 } from "@/api/base44Client";

// Streams ActionLog entries in real time. Returns the rolling buffer (newest
// first), capped at MAX, plus a Set of ids that arrived in the latest tick
// (used by the UI to flash new rows).
const MAX = 500;

export function useLiveLogs({ paused }) {
  const [logs, setLogs] = React.useState([]);
  const [newIds, setNewIds] = React.useState(() => new Set());
  const pausedRef = React.useRef(paused);
  pausedRef.current = paused;

  // Initial backfill
  React.useEffect(() => {
    let cancelled = false;
    base44.entities.ActionLog.list("-created_date", MAX).then((rows) => {
      if (!cancelled) setLogs(rows);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Live subscription
  React.useEffect(() => {
    const unsub = base44.entities.ActionLog.subscribe((event) => {
      if (pausedRef.current) return;
      if (event.type === "create" && event.data) {
        setLogs((prev) => {
          if (prev.some((l) => l.id === event.data.id)) return prev;
          const next = [event.data, ...prev];
          return next.length > MAX ? next.slice(0, MAX) : next;
        });
        setNewIds((prev) => {
          const next = new Set(prev);
          next.add(event.data.id);
          return next;
        });
        // clear flash highlight after animation
        setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            next.delete(event.data.id);
            return next;
          });
        }, 1500);
      }
    });
    return unsub;
  }, []);

  return { logs, newIds };
}