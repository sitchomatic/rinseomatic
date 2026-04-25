import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import CredentialRow from "./CredentialRow";
import VirtualCredentialList from "./VirtualCredentialList";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import { cn } from "@/lib/utils";

// Below this threshold, render the rows inline (cheaper than virtualization
// boilerplate). Above it, switch to windowed rendering. 200 rows is well
// within React's comfort zone for this row size.
const VIRTUALIZE_THRESHOLD = 200;

const COLUMNS = [
  { key: "username", label: "Username", sortable: true, accessor: (c) => (c.username || "").toLowerCase() },
  { key: "password", label: "Password", sortable: false },
  { key: "site_key", label: "Site", sortable: true, accessor: (c) => c.site_key || "" },
  { key: "status", label: "Status", sortable: true, accessor: (c) => c.status || "untested" },
  { key: "last_tested", label: "Last tested", sortable: true, accessor: (c) => c.last_tested ? new Date(c.last_tested).getTime() : 0 },
];

export default function CredentialsTable({ items, sites, selected, onToggle, onToggleAll, onDelete }) {
  const { copy, copiedKey } = useCopyToClipboard();
  const [sortKey, setSortKey] = React.useState(null);
  const [sortDir, setSortDir] = React.useState("asc");

  const siteByKey = React.useMemo(
    () => Object.fromEntries((sites || []).map((s) => [s.key, s])),
    [sites]
  );

  const sorted = React.useMemo(() => {
    if (!sortKey) return items;
    const col = COLUMNS.find((c) => c.key === sortKey);
    if (!col?.accessor) return items;
    const arr = [...items];
    arr.sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [items, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortKey(null); setSortDir("asc");
  };

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const allChecked = items.length > 0 && selected.size === items.length;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 py-16 text-center text-sm text-muted-foreground">
        No credentials match.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[32px_minmax(0,2fr)_minmax(0,2fr)_120px_110px_140px_48px] gap-3 px-4 py-2.5 border-b border-border bg-secondary/40 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <Checkbox checked={allChecked} onCheckedChange={onToggleAll} />
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            type="button"
            disabled={!col.sortable}
            onClick={() => col.sortable && toggleSort(col.key)}
            className={cn(
              "flex items-center gap-1.5 text-left",
              col.sortable ? "hover:text-foreground cursor-pointer" : "cursor-default",
              sortKey === col.key && "text-foreground"
            )}
          >
            {col.label}
            {col.sortable && <SortIcon colKey={col.key} />}
          </button>
        ))}
        <div></div>
      </div>
      {sorted.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualCredentialList
          items={sorted}
          siteByKey={siteByKey}
          selected={selected}
          onToggle={onToggle}
          onDelete={onDelete}
          copy={copy}
          copiedKey={copiedKey}
        />
      ) : (
        <div className="divide-y divide-border/60">
          {sorted.map((c) => (
            <CredentialRow
              key={c.id}
              c={c}
              siteLabel={siteByKey[c.site_key]?.label}
              selected={selected.has(c.id)}
              onToggle={onToggle}
              onDelete={onDelete}
              copy={copy}
              copiedKey={copiedKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}