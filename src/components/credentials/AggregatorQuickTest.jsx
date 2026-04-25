import React from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

// Renders one quick-test row per aggregator site (any site with secondary_site_keys).
// Lets the user kick off a run that targets ONE specific underlying site (e.g.
// "test Double creds against Joe only").
export default function AggregatorQuickTest({ sites, siteCounts, onQuickRun }) {
  // L19 + L22: memoize aggregator filtering and build an O(1) label index.
  // Was running on every parent re-render (Credentials page polls + filters
  // constantly while a run is active).
  const { visible, labelFor } = React.useMemo(() => {
    const byKey = Object.fromEntries((sites || []).map((s) => [s.key, s]));
    const aggregators = (sites || []).filter(
      (s) => Array.isArray(s.secondary_site_keys) && s.secondary_site_keys.length > 0
    );
    const visible = aggregators.filter((agg) => (siteCounts?.[agg.key] || 0) > 0);
    return {
      visible,
      labelFor: (key) => byKey[key]?.label || key,
    };
  }, [sites, siteCounts]);

  if (visible.length === 0) return null;

  return (
    <div className="mb-5 space-y-2">
      {visible.map((agg) => (
        <div
          key={agg.key}
          className="rounded-lg border border-border bg-card/60 px-4 py-3 flex flex-wrap items-center gap-3"
        >
          <div className="text-xs text-muted-foreground">
            Quick-test{" "}
            <span className="font-mono text-foreground">{agg.label}</span>{" "}
            credentials ({siteCounts?.[agg.key] || 0}) against:
          </div>
          {agg.secondary_site_keys.map((tk) => (
            <Button
              key={tk}
              size="sm"
              variant="outline"
              className="gap-2 h-7"
              onClick={() => onQuickRun(agg, tk)}
            >
              <Play className="h-3 w-3" /> {labelFor(tk)} only
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}