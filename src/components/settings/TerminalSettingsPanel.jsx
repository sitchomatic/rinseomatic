import React from "react";
import { Terminal, Network, Radio, Activity, Eye, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getTerminalSettings, updateTerminalSettings } from "@/lib/terminalSettings";

export default function TerminalSettingsPanel() {
  const [settings, setSettings] = React.useState(() => getTerminalSettings());

  const update = (patch) => {
    const next = updateTerminalSettings(patch);
    setSettings(next);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
          <Terminal className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-medium">Live terminal</div>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-2xl">
            Control what the floating terminal captures: app commands, backend responses, real-time socket frames, and server-side log events.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <ToggleRow
          icon={Network}
          title="Fetch traffic"
          description="Show app SDK requests and responses for entities, functions, auth, integrations, and agents."
          checked={settings.captureFetch}
          onChange={(v) => update({ captureFetch: v })}
        />
        <ToggleRow
          icon={Radio}
          title="Realtime frames"
          description="Show WebSocket and EventSource subscription activity."
          checked={settings.captureSockets}
          onChange={(v) => update({ captureSockets: v })}
        />
        <ToggleRow
          icon={Activity}
          title="Backend logs"
          description="Stream ActionLog events from worker functions and ScrapingBee verdict logging."
          checked={settings.captureActionLogs}
          onChange={(v) => update({ captureActionLogs: v })}
        />
        <ToggleRow
          icon={Eye}
          title="Payload details"
          description="Allow expandable request, response, socket, and event payload previews."
          checked={settings.showPayloads}
          onChange={(v) => update({ showPayloads: v })}
        />
        <ToggleRow
          icon={AlertTriangle}
          title="Open on errors"
          description="Automatically open the terminal when a captured error appears."
          checked={settings.openOnError}
          onChange={(v) => update({ openOnError: v })}
        />
      </div>
    </div>
  );
}

function ToggleRow({ icon: Icon, title, description, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/40 p-3 cursor-pointer">
      <div className="flex gap-3 min-w-0">
        <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div>
          <div className="text-xs font-medium">{title}</div>
          <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">{description}</div>
        </div>
      </div>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </label>
  );
}