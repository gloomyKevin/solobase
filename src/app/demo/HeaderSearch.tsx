"use client";

import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { SmartInput } from "./SmartInput";

export function HeaderSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(true); }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-8 rounded-lg border border-border/30 bg-muted/20 px-3 text-[12px] text-muted-foreground/40 hover:bg-muted/40 hover:border-border/50 transition-all cursor-text"
      >
        <Search className="h-3 w-3" />
        <span className="hidden sm:inline">搜索、链接或想法</span>
        <kbd className="hidden md:inline ml-3 text-[10px] text-muted-foreground/20 border border-border/20 rounded px-1 py-px font-latin">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-foreground/8 backdrop-blur-sm" />
          <div className="relative max-w-xl mx-auto mt-[12vh] sm:mt-[18vh] px-4" onClick={(e) => e.stopPropagation()}>
            <SmartInput autoFocus />
            <div className="flex justify-center mt-3">
              <button onClick={() => setOpen(false)} className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/50 transition-colors">
                <X className="h-3 w-3" />ESC
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
