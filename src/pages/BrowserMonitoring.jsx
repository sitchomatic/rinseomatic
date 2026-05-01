import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, Camera, Video, MonitorPlay, CheckCircle2, AlertTriangle, ExternalLink, PlaySquare } from "lucide-react";

export default function BrowserMonitoring() {
  const [scrapingbeeStatus, setScrapingbeeStatus] = useState(null);
  const [browserlessStatus, setBrowserlessStatus] = useState(null);

  const { data: recentScreenshots = [] } = useQuery({
    queryKey: ["recent-screenshots"],
    queryFn: () => base44.entities.TestResult.filter({ screenshot_url: { $ne: null } }, "-tested_at", 4),
  });

  const checkServiceMut = useMutation({
    mutationFn: async (service) => {
      const res = await base44.functions.invoke("checkBrowserServiceStatus", { service });
      return { service, data: res.data };
    },
    onSuccess: ({ service, data }) => {
      if (service === "scrapingbee") setScrapingbeeStatus(data);
      if (service === "browserless") setBrowserlessStatus(data);
    }
  });

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto h-full flex flex-col">
      <PageHeader
        eyebrow="Monitoring"
        title="Browser Monitoring & Media"
        description="Live Look-In, Session Recordings, and Screenshots for integrated automation services."
      />

      <div className="grid grid-cols-1 gap-10">
        
        {/* SCRAPINGBEE SECTION */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <span className="text-amber-500 font-bold text-sm">SB</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold">ScrapingBee</h2>
              <p className="text-xs text-muted-foreground">Primary extraction and screenshot provider</p>
            </div>
            <div className="ml-auto">
              <Button 
                size="sm" 
                variant="outline" 
                className="gap-2"
                onClick={() => checkServiceMut.mutate("scrapingbee")}
                disabled={checkServiceMut.isPending}
              >
                <Activity className="h-4 w-4" />
                Connection Test
              </Button>
            </div>
          </div>

          <Card className="bg-card/40 border-border/60">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Service Status</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {scrapingbeeStatus ? scrapingbeeStatus.details || scrapingbeeStatus.message : "Click 'Connection Test' to check."}
                  </CardDescription>
                </div>
                {scrapingbeeStatus && (
                  <Badge variant={scrapingbeeStatus.ok ? "default" : "destructive"} className={scrapingbeeStatus.ok ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : ""}>
                    {scrapingbeeStatus.ok ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                    {scrapingbeeStatus.status}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-primary" />
                  <h3 className="font-medium text-sm">Screenshots</h3>
                  <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Supported</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  ScrapingBee captures full-page or viewport screenshots using the <code className="bg-muted px-1 rounded">screenshot=true</code> parameter.
                </p>
                {recentScreenshots.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {recentScreenshots.slice(0, 2).map(r => (
                      <div key={r.id} className="aspect-video bg-black rounded overflow-hidden border border-border/50 relative group">
                        <img src={r.screenshot_url} alt="capture" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 rounded text-[9px] font-mono text-white/90">{r.site_key}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic bg-secondary/30 p-2 rounded border border-border/50">No recent screenshots found.</div>
                )}
              </div>

              <div className="space-y-3 opacity-60">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm">Session Recording</h3>
                  <Badge variant="outline" className="ml-auto text-[10px]">Unsupported</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  ScrapingBee's API is designed for single-request extractions and does not support continuous video recording or screencasting of the headless session.
                </p>
              </div>

              <div className="space-y-3 opacity-60">
                <div className="flex items-center gap-2">
                  <MonitorPlay className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm">Live Look-In</h3>
                  <Badge variant="outline" className="ml-auto text-[10px]">Unsupported</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  No CDP (Chrome DevTools Protocol) websocket endpoints are exposed for live debugging or remote viewing during a ScrapingBee request.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="flex items-center justify-center">
          <Separator className="w-1/3" />
          <span className="mx-4 text-xs font-mono text-muted-foreground uppercase tracking-widest">Service Boundary</span>
          <Separator className="w-1/3" />
        </div>

        {/* BROWSERLESS SECTION */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <span className="text-blue-500 font-bold text-sm">BL</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold">Browserless</h2>
              <p className="text-xs text-muted-foreground">Secondary provider for persistent sessions & debugging</p>
            </div>
            <div className="ml-auto">
              <Button 
                size="sm" 
                variant="outline" 
                className="gap-2"
                onClick={() => checkServiceMut.mutate("browserless")}
                disabled={checkServiceMut.isPending}
              >
                <Activity className="h-4 w-4" />
                Connection Test
              </Button>
            </div>
          </div>

          <Card className="bg-card/40 border-border/60">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Service Status</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {browserlessStatus ? browserlessStatus.details || browserlessStatus.message : "Click 'Connection Test' to check via BROWSERLESS_TOKEN secret."}
                  </CardDescription>
                </div>
                {browserlessStatus && (
                  <Badge variant={browserlessStatus.ok ? "default" : "destructive"} className={browserlessStatus.ok ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : ""}>
                    {browserlessStatus.ok ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                    {browserlessStatus.status}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-primary" />
                  <h3 className="font-medium text-sm">Screenshots</h3>
                  <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Supported</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Browserless supports a dedicated <code className="bg-muted px-1 rounded">/screenshot</code> REST API for on-demand captures of persistent sessions.
                </p>
                <Button size="sm" variant="secondary" className="w-full text-xs h-7" disabled={!browserlessStatus?.ok}>
                  <Camera className="h-3 w-3 mr-2" /> Request Capture
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-primary" />
                  <h3 className="font-medium text-sm">Session Recording</h3>
                  <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Supported</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Browserless can record the DOM (Session Replay) or raw video when the <code className="bg-muted px-1 rounded">record</code> capability is enabled during session launch.
                </p>
                <Button size="sm" variant="secondary" className="w-full text-xs h-7" disabled={!browserlessStatus?.ok}>
                  <PlaySquare className="h-3 w-3 mr-2" /> View Replays
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MonitorPlay className="h-4 w-4 text-primary" />
                  <h3 className="font-medium text-sm">Live Look-In</h3>
                  <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Supported</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect via the Live Debugger to interact with running sessions in real-time. Requires an active WebSocket session ID.
                </p>
                {browserlessStatus?.sessions?.length > 0 ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-md flex items-center justify-between">
                    <span className="text-xs text-emerald-400 font-mono">Session active</span>
                    <Button size="sm" className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-500">Connect</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" className="w-full text-xs h-7 gap-2" disabled={!browserlessStatus?.ok}>
                    <ExternalLink className="h-3 w-3" /> Open Debugger
                  </Button>
                )}
              </div>

            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}