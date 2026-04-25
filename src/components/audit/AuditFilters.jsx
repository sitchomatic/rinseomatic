import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Search } from "lucide-react";

const LEVELS = ["all", "success", "info", "warn", "error", "debug"];
const CATEGORIES = ["all", "auth", "network", "system", "proxy", "dom", "ai"];

export default function AuditFilters({
  search, onSearch,
  level, onLevel,
  category, onCategory,
  autoscroll, onAutoscroll,
  paused, onPause,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Filter messages…"
          className="pl-9 h-8 text-xs"
        />
      </div>
      <Select value={level} onValueChange={onLevel}>
        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {LEVELS.map((l) => <SelectItem key={l} value={l} className="text-xs uppercase tracking-wider">{l}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={category} onValueChange={onCategory}>
        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs uppercase tracking-wider">{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer ml-auto">
        <Switch checked={autoscroll} onCheckedChange={onAutoscroll} />
        Auto-scroll
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
        <Switch checked={!paused} onCheckedChange={(v) => onPause(!v)} />
        {paused ? "Paused" : "Live"}
      </label>
    </div>
  );
}