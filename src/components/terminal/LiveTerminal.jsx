import React from "react";
import { Terminal as TerminalIcon, X, Trash2, Pause, Play, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribe, clear as clearStore } from "@/lib/terminalStore";
import TerminalRow from "@/components/terminal/TerminalRow";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "req", label: "→ Req" },
  { key: "res", label: "← Res" },
  { key: "log", label: "Logs" },
];

// Floating, togglable terminal docked to the bottom of the viewport. Shows a
// unified stream of network requests/responses (← / →) and ActionLog rows.
// Hotkey: backtick (`) toggles open/closed.
export default function LiveTerminal() {
  const [open, setOpen] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [entries, setEntries] = React.useState([]);
  const [height, setHeight] = React.useState(320);
  const [collapsed, setCollapsed] = React.useState(false);
  const liveBufferRef = React.useRef([]);
  const scrollRef = React.useRef(null);

  // Subscribe to the store. When paused, we accumulate but don't re-render
  // so the user can read frozen content.
  React.useEffect(() => {
    return subscribe((next) => {
      liveBufferRef.current = next;
      if (!paused) setEntries(next);
    });
  }, [paused]);

  // Resume → flush pending buffer.
  React.useEffect(() => {
    if (!paused) setEntries(liveBufferRef.current);
  }, [paused]);

  // Hotkey: backtick toggles the terminal. Ignore when typing in an input.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "`") return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-scroll to top (newest) on new entries — buffer is newest-first so
  // scrollTop=0 keeps the latest row in view.
  React.useEffect(() => {
    if (!open || collapsed) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [entries, open, collapsed]);

  const filtered = React.useMemo(() => {
    let out = entries;
    if (filter !== "all") out = out.filter((e) => e.kind === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((e) => {
        const hay = [e.url, e.message, e.method, e.status, e.category, e.site, e.error]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return out;
  }, [entries, filter, search]);

  const counts = React.useMemo(() => {
    let req = 0, res = 0, log = 0, err = 0;
    for (const e of entries) {
      if (e.kind === "req") req++;
      else if (e.kind === "res") { res++; if (!e.ok) err++; }
      else if (e.kind === "log") { log++; if (e.level === "error") err++; }
    }
    return { req, res, log, err };
  }, [entries]);

  // Drag-resize handle.
  const onResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (ev) => {
      const next = Math.max(160, Math.min(window.innerHeight - 80, startH + (startY - ev.clientY)));
      setHeight(next);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Floating launcher (when closed)
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-border bg-card/90 backdrop-blur px-3 py-2 text-xs font-mono shadow-lg hover:bg-secondary"
        title="Open live terminal (`)"
      >
        <TerminalIcon className="h-3.5 w-3.5 text-primary" />
        <span>terminal</span>
        {counts.err > 0 && (
          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-rose-500/20 text-rose-300 text-[10px] tabular-nums">
            {counts.err}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed left-0 right-0 bottom-0 z-50 bg-background/95 backdrop-blur border-t border-border shadow-2xl flex flex-col",
        collapsed && "h-9"
      )}
      style={collapsed ? undefined : { height }}
    >
      {/* drag handle */}
      {!collapsed && (
        <div
          onMouseDown={onResize}
          className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize hover:bg-primary/30"
          title="Drag to resize"
        />
      )}

      {/* header */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border bg-card/40 shrink-0">
        <TerminalIcon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-mono font-semibold">live terminal</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          → {counts.req} · ← {counts.res} · ▸ {counts.log}
          {counts.err > 0 && <span className="text-rose-300"> · ⚠ {counts.err}</span>}
        </span>

        {!collapsed && (
          <>
            <div className="hidden md:flex items-center gap-1 ml-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider transition-colors",
                    filter === f.key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter…"
              className="ml-2 hidden md:block bg-secondary/40 border border-border rounded px-2 py-0.5 text-[11px] font-mono w-48 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <IconBtn onClick={() => setPaused((v) => !v)} title={paused ? "Resume" : "Pause"}>
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </IconBtn>
          <IconBtn onClick={() => clearStore()} title="Clear">
            <Trash2 className="h-3 w-3" />
          </IconBtn>
          <IconBtn onClick={() => setCollapsed((v) => !v)} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </IconBtn>
          <IconBtn onClick={() => setOpen(false)} title="Close (`)">
            <X className="h-3 w-3" />
          </IconBtn>
        </div>
      </div>

      {!collapsed && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll font-mono text-xs">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              {entries.length === 0
                ? "Waiting for activity… interact with the app to see live traffic."
                : "Nothing matches the current filter."}
            </div>
          ) : (
            filtered.map((e) => <TerminalRow key={e.id} entry={e} />)
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, ...props }) {
  return (
    <button
      type="button"
      className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
      {...props}
    >
      {children}
    </button>
  );
}