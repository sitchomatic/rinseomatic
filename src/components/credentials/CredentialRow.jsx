import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Trash2, Copy, Check } from "lucide-react";
import StatusPill from "@/components/shared/StatusPill";
import SiteChip from "@/components/shared/SiteChip";
import { format } from "date-fns";

function CopyButton({ value, copyKey, copy, copiedKey, label }) {
  const active = copiedKey === copyKey;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); copy(value, copyKey, label); }}
      className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
      title={`Copy ${label}`}
    >
      {active ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function CredentialRow({ c, siteLabel, selected, onToggle, onDelete, copy, copiedKey }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="group grid grid-cols-[32px_minmax(0,2fr)_minmax(0,2fr)_120px_110px_140px_48px] gap-3 px-4 py-2.5 items-center text-sm hover:bg-secondary/30 transition-colors">
      <Checkbox checked={selected} onCheckedChange={() => onToggle(c.id)} />
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate font-mono text-xs">{c.username}</span>
        <CopyButton value={c.username} copyKey={`u-${c.id}`} copy={copy} copiedKey={copiedKey} label="username" />
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate font-mono text-xs">
          {visible ? c.password : "••••••••"}
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-colors"
          onClick={() => setVisible((v) => !v)}
          title={visible ? "Hide" : "Show"}
        >
          {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
        <CopyButton value={c.password} copyKey={`p-${c.id}`} copy={copy} copiedKey={copiedKey} label="password" />
      </div>
      <div><SiteChip siteKey={c.site_key} label={siteLabel} size="sm" /></div>
      <div><StatusPill status={c.status || "untested"} /></div>
      <div className="text-xs text-muted-foreground font-mono">
        {c.last_tested ? format(new Date(c.last_tested), "MMM d HH:mm") : "—"}
      </div>
      <div className="text-right">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-rose-400" onClick={() => onDelete(c)} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}