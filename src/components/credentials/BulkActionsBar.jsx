import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2, X, Play } from "lucide-react";

export default function BulkActionsBar({ count, sameSite, onClear, onDelete, onRun }) {
  if (count === 0) return null;
  return (
    <div className="sticky top-2 z-20 mb-3 rounded-xl border border-primary/30 bg-card/95 backdrop-blur shadow-lg px-3 py-2 flex items-center gap-2 animate-fade-in">
      <div className="text-xs font-mono">
        <span className="text-primary font-semibold">{count}</span>
        <span className="text-muted-foreground ml-1">selected</span>
      </div>
      <div className="h-4 w-px bg-border mx-1" />
      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5 h-7"
        onClick={onRun}
        disabled={!sameSite}
        title={!sameSite ? "Selection must share one site" : undefined}
      >
        <Play className="h-3 w-3" /> Test selected
      </Button>
      <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10" onClick={onDelete}>
        <Trash2 className="h-3 w-3" /> Delete
      </Button>
      <Button size="sm" variant="ghost" className="gap-1.5 h-7 ml-auto text-muted-foreground" onClick={onClear}>
        <X className="h-3 w-3" /> Clear
      </Button>
    </div>
  );
}