import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { MonitorPlay, AlertTriangle, CheckCircle2, Clock, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Recordings() {
  const navigate = useNavigate();
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["screenshots"],
    // Fetch recent test results that have a screenshot
    queryFn: () => base44.entities.TestResult.filter({ screenshot_url: { $ne: null } }, "-tested_at", 100),
    refetchInterval: 10000, // auto refresh
  });

  const { data: settingsRow = [] } = useQuery({
    queryKey: ["app-settings-screenshots"],
    queryFn: () => base44.entities.AppSettings.list("-created_date", 1),
  });

  const isCapturing = settingsRow[0]?.capture_screenshots;

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto h-full flex flex-col">
      <PageHeader
        eyebrow="Visual Logs"
        title="Live Look-in & Recordings"
        description="Monitor automated browser session screenshots captured at the end of execution."
        actions={
          !isCapturing && settingsRow.length > 0 && (
            <Button size="sm" variant="outline" className="gap-2 text-amber-500 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20" onClick={() => navigate("/settings")}>
              <AlertTriangle className="h-3.5 w-3.5" /> Enable Screenshots in Settings
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : results.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-card/40 p-12 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <MonitorPlay className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No recordings found</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Screenshots are captured automatically at the end of browser sessions if enabled in your settings. 
            Currently, there are no visual logs to display.
          </p>
          <Button onClick={() => navigate("/settings")} variant="outline">
            Check Settings
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map((result) => (
            <div 
              key={result.id} 
              className="group relative bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors shadow-sm"
              onClick={() => setSelectedScreenshot(result)}
            >
              <div className="aspect-[4/3] bg-black relative">
                <img 
                  src={result.screenshot_url} 
                  alt="Session capture" 
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
                
                <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
                  <div className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-semibold tracking-wide uppercase backdrop-blur-md",
                    result.status === 'working' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                    result.status === 'failed' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                    'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  )}>
                    {result.status === 'working' && <CheckCircle2 className="h-3 w-3" />}
                    {result.status === 'failed' && <AlertTriangle className="h-3 w-3" />}
                    {result.status === 'error' && <Info className="h-3 w-3" />}
                    {result.status}
                  </div>
                  <div className="px-2 py-1 rounded bg-black/50 border border-white/10 text-white text-[10px] font-mono backdrop-blur-md">
                    {result.site_key}
                  </div>
                </div>
                
                <div className="absolute bottom-2 left-2 right-2">
                  <div className="text-sm font-medium text-white truncate drop-shadow-md mb-0.5">
                    {result.username}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-white/70">
                    <Clock className="h-3 w-3" />
                    <span>{formatDistanceToNow(new Date(result.tested_at || result.created_date), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen Modal */}
      <Dialog open={!!selectedScreenshot} onOpenChange={(open) => !open && setSelectedScreenshot(null)}>
        <DialogContent className="max-w-[90vw] w-fit p-0 overflow-hidden bg-black/95 border-border/50">
          {selectedScreenshot && (
            <div className="relative flex flex-col max-h-[90vh]">
              <div className="absolute top-4 right-4 z-50">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 bg-black/50 text-white hover:bg-white/20 rounded-full backdrop-blur"
                  onClick={() => setSelectedScreenshot(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-4 border-b border-white/10 bg-black/40 backdrop-blur-sm flex items-center justify-between z-10 shrink-0">
                <div>
                  <h3 className="text-white font-medium flex items-center gap-2">
                    {selectedScreenshot.site_key} <span className="text-white/40">/</span> <span className="font-mono text-sm">{selectedScreenshot.username}</span>
                  </h3>
                  <div className="text-white/60 text-xs mt-1">
                    Captured {new Date(selectedScreenshot.tested_at || selectedScreenshot.created_date).toLocaleString()}
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide border",
                  selectedScreenshot.status === 'working' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  selectedScreenshot.status === 'failed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                  'bg-amber-500/10 text-amber-400 border-amber-500/20'
                )}>
                  {selectedScreenshot.status}
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0 bg-neutral-900 flex justify-center p-4 custom-scrollbar">
                <img 
                  src={selectedScreenshot.screenshot_url} 
                  alt="Full capture" 
                  className="max-w-full h-auto object-contain shadow-2xl rounded-sm ring-1 ring-white/10"
                />
              </div>
              {selectedScreenshot.error_message && (
                <div className="p-3 bg-rose-500/10 border-t border-rose-500/20 text-rose-300 text-xs font-mono shrink-0 whitespace-pre-wrap overflow-auto max-h-32">
                  {selectedScreenshot.error_message}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style dangerouslySetInline={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      `}} />
    </div>
  );
}