import React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import CredentialRow from "./CredentialRow";

const ROW_HEIGHT = 49; // matches CredentialRow height (py-2.5 + content)

// Virtualised list — only renders rows visible in the scroll viewport plus a
// small overscan buffer. Lets us hold 10k+ credentials in memory without
// rendering 10k React subtrees.
export default function VirtualCredentialList({ items, siteByKey, selected, onToggle, onDelete, copy, copiedKey }) {
  const parentRef = React.useRef(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const total = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className="max-h-[640px] overflow-auto thin-scroll">
      <div className="divide-y divide-border/60 relative" style={{ height: total }}>
        {virtualItems.map((vi) => {
          const c = items[vi.index];
          return (
            <div
              key={c.id}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <CredentialRow
                c={c}
                siteLabel={siteByKey[c.site_key]?.label}
                selected={selected.has(c.id)}
                onToggle={onToggle}
                onDelete={onDelete}
                copy={copy}
                copiedKey={copiedKey}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}