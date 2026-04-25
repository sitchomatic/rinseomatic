import React from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ct_theme";

function readTheme() {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem(STORAGE_KEY) || "dark";
}

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "light") root.classList.add("light");
  else root.classList.remove("light");
}

export default function ThemeToggle({ className }) {
  const [theme, setTheme] = React.useState(readTheme);

  React.useEffect(() => { applyTheme(theme); }, [theme]);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
  };

  return (
    <button
      onClick={toggle}
      title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className={cn(
        "h-7 w-7 rounded-md border border-border bg-card hover:bg-secondary transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {theme === "light"
        ? <Moon className="h-3.5 w-3.5" />
        : <Sun className="h-3.5 w-3.5" />}
    </button>
  );
}