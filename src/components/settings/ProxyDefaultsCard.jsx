import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import ProxyControls from "@/components/shared/ProxyControls";

export default function ProxyDefaultsCard() {
  const qc = useQueryClient();

  const { data: settingsList = [] } = useQuery({
    queryKey: ["app_settings"],
    queryFn: () => base44.entities.AppSettings.list("-created_date", 1),
  });
  const settings = settingsList[0];

  const { data: proxies = [] } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => base44.entities.Proxy.list("-created_date", 100),
  });
  const enabledProxies = proxies.filter((p) => p.enabled !== false);

  const [draft, setDraft] = React.useState(null);

  React.useEffect(() => {
    if (settings) {
      setDraft({
        type: settings.proxy_type || "stealth",
        country_code: settings.country_code || "au",
        external_proxy_id: settings.external_proxy_id || "",
      });
    } else {
      setDraft({ type: "stealth", country_code: "au", external_proxy_id: "" });
    }
  }, [settings?.id]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        singleton_key: "global",
        proxy_type: draft.type,
        country_code: draft.country_code,
        external_proxy_id: draft.type === "external" ? draft.external_proxy_id : "",
      };
      if (settings?.id) return base44.entities.AppSettings.update(settings.id, payload);
      return base44.entities.AppSettings.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success("Proxy defaults saved");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!draft) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <div className="text-sm font-medium">Proxy defaults</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Applied to every run unless overridden in the New Run dialog.
      </p>
      <ProxyControls
        value={draft}
        onChange={setDraft}
        externalProxies={enabledProxies}
      />
      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          Save defaults
        </Button>
      </div>
    </div>
  );
}