import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image as ImageIcon, ExternalLink } from "lucide-react";

// Tiny clickable thumbnail. Opens a lightbox modal with the full screenshot.
// Renders nothing when there's no URL — keeps the column quiet for runs where
// capture_screenshots is off.
export default function ScreenshotPreview({ url, username }) {
  const [open, setOpen] = React.useState(false);
  if (!url) {
    return <span className="text-muted-foreground/50 text-[10px]">—</span>;
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-1.5 rounded border border-border bg-secondary/40 hover:bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        title="View screenshot"
      >
        <ImageIcon className="h-3 w-3" />
        view
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              Final-state screenshot
              {username && <span className="text-muted-foreground font-mono text-xs">· {username}</span>}
              <a
                href={url} target="_blank" rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" /> open
              </a>
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-secondary/20 overflow-hidden max-h-[70vh] overflow-y-auto thin-scroll">
            <img src={url} alt="Login attempt" className="w-full block" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}