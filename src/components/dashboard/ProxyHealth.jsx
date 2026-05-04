import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Activity, Loader2, AlertTriangle, CheckCircle2, Server } from "lucide-react";
import { toast } from "sonner";

export default function ProxyHealth() {
  const [proxies, setProxies] = useState([]);

  const pingMut = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("pingProxies", {});
      return res.data;
    },
    onSuccess: (data) => {
      setProxies(data.results || []);
      const highLatency = (data.results || []).filter(p => p.latency_ms > 500);
      if (highLatency.length > 0) {
        toast.warning(`${highLatency.length} proxy/proxies have latency > 500ms`, { icon: <AlertTriangle className="text-amber-500 w-4 h-4"/> });
      }
    },
    onError: (e) => toast.error(e?.message || "Failed to ping proxies"),
  });

  useEffect(() => {
    pingMut.mutate();
    // Ping every 30 seconds
    const interval = setInterval(() => pingMut.mutate(), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="mb-8 overflow-hidden border-border/60 bg-card/40">
      <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Real-time Proxy Health</CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={() => pingMut.mutate()} disabled={pingMut.isPending} className="h-7 text-xs">
          {pingMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Activity className="h-3 w-3 mr-2" />}
          Ping Now
        </Button>
      </CardHeader>
      <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {proxies.length === 0 && !pingMut.isPending && (
          <div className="col-span-full text-xs text-muted-foreground py-4">No active proxies tested. Make sure proxies are enabled in Settings.</div>
        )}
        {proxies.map(p => (
          <div key={p.id} className={`rounded-lg border p-3 flex flex-col gap-2 ${p.latency_ms > 500 ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold truncate" title={p.label}>{p.label}</span>
              <Badge variant="outline" className={`text-[10px] ${p.status === "healthy" && p.latency_ms <= 500 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : p.status === "degraded" || p.latency_ms > 500 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                {p.latency_ms > 500 && p.status === "healthy" ? "degraded" : p.status}
              </Badge>
            </div>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-bold tabular-nums">
                {p.latency_ms ? `${p.latency_ms}` : "---"}<span className="text-xs text-muted-foreground ml-1">ms</span>
              </div>
              {(p.latency_ms > 500 || p.status !== "healthy") && (
                <AlertTriangle className={`h-4 w-4 ${p.latency_ms > 500 ? "text-amber-500" : "text-rose-500"}`} />
              )}
            </div>
            {p.error && <div className="text-[10px] text-rose-400 truncate mt-1">{p.error}</div>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}