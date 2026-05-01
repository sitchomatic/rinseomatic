import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Loader2, Camera, ExternalLink } from "lucide-react";
import StatusPill from "@/components/shared/StatusPill";
import ResultDetailDialog from "@/components/runs/ResultDetailDialog";

export default function RunScreenshotsGallery({ results, isRunning }) {
  const [selectedResult, setSelectedResult] = useState(null);

  // Extract all session IDs from this run's results
  const sessionIds = useMemo(() => results.map((r) => r.id), [results]);

  // Poll for Screenshot records belonging to any of these sessions every 500ms
  // We chunk the IDs to avoid massive $in queries if there are thousands of results.
  // Realistically, we just want the latest screenshots if there are many.
  const { data: stepScreenshots = [], isLoading } = useQuery({
    queryKey: ["run-screenshots", sessionIds.length],
    queryFn: async () => {
      if (sessionIds.length === 0) return [];
      
      // If there are too many, we just fetch the most recent global screenshots and filter in memory,
      // but to be safe and correct we chunk the $in query.
      const CHUNK = 100;
      const allShots = [];
      // To keep it fast, only check the last 500 sessions if the run is huge
      const recentIds = sessionIds.slice(0, 500); 
      
      for (let i = 0; i < recentIds.length; i += CHUNK) {
        const batch = recentIds.slice(i, i + CHUNK);
        const fetched = await base44.entities.Screenshot.filter(
          { session_id: { $in: batch } },
          "-captured_at",
          200
        );
        allShots.push(...fetched);
      }
      return allShots.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
    },
    refetchInterval: 500, // Every 500ms poll as requested
    enabled: sessionIds.length > 0,
  });

  // Combine final screenshots (from TestResult) with step screenshots (from Screenshot)
  const gallery = useMemo(() => {
    const items = [];

    for (const r of results) {
      if (r.screenshot_url) {
        items.push({
          id: `final-${r.id}`,
          url: r.screenshot_url,
          label: "Final Capture",
          timestamp: r.tested_at || r.created_date,
          result: r,
          type: "final"
        });
      }
    }

    const resultMap = new Map(results.map(r => [r.id, r]));
    
    for (const shot of stepScreenshots) {
      const parentResult = resultMap.get(shot.session_id);
      if (parentResult) {
        items.push({
          id: `step-${shot.id}`,
          url: shot.image_url,
          label: shot.step_label || "Step Capture",
          timestamp: shot.captured_at,
          result: parentResult,
          type: "step"
        });
      }
    }

    return items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [results, stepScreenshots]);

  if (isLoading && gallery.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/40 py-20 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (gallery.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 py-16 flex flex-col items-center justify-center text-center">
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center mb-3">
          <Camera className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium">No screenshots yet</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-sm">
          Screenshots will appear here automatically when captured by the browser. 
          Enable "Capture screenshots" in Settings.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {gallery.map((item) => (
          <div 
            key={item.id} 
            className="group flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => setSelectedResult(item.result)}
          >
            <div className="relative aspect-video bg-black overflow-hidden border-b border-border">
              <img 
                src={item.url} 
                alt="Capture" 
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ExternalLink className="text-white h-6 w-6" />
              </div>
              <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] font-mono px-1.5 py-0.5 rounded">
                {format(new Date(item.timestamp), "HH:mm:ss")}
              </div>
              <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider">
                {item.label}
              </div>
            </div>
            <div className="p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-mono truncate" title={item.result.username}>
                  {item.result.username}
                </div>
              </div>
              <StatusPill status={item.result.status} />
            </div>
          </div>
        ))}
      </div>
      
      <ResultDetailDialog result={selectedResult} onOpenChange={setSelectedResult} />
    </div>
  );
}