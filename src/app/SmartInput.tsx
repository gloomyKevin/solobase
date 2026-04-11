"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Rocket, Lightbulb, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DetectedIntent {
  type: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
}

function detectIntents(input: string): DetectedIntent[] {
  const t = input.trim();
  if (!t) return [];
  if (/^https?:\/\//.test(t) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(t)) {
    return [
      { type: "submit", label: "提交这个产品", icon: <Rocket className="h-4 w-4" />, primary: true },
      { type: "search", label: "搜索相关创造", icon: <Search className="h-4 w-4" /> },
    ];
  }
  if (/^(我做了|我开发了|我上线了|我最近做了)/.test(t)) {
    return [
      { type: "submit", label: "提交你的创造", icon: <Rocket className="h-4 w-4" />, primary: true },
      { type: "search", label: "搜索相关创造", icon: <Search className="h-4 w-4" /> },
    ];
  }
  if (/^(我想做|想做|如果有|要是能|有没有可能)/.test(t)) {
    return [
      { type: "idea", label: "把这个想法发布出来", icon: <Lightbulb className="h-4 w-4" />, primary: true },
      { type: "search", label: "看看已有的类似创造", icon: <Search className="h-4 w-4" /> },
    ];
  }
  return [
    { type: "search", label: `搜索「${t.slice(0, 20)}」相关创造`, icon: <Search className="h-4 w-4" />, primary: true },
    { type: "idea", label: "分享一个相关想法", icon: <Lightbulb className="h-4 w-4" /> },
  ];
}

export function SmartInput({ autoFocus }: { autoFocus?: boolean }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const intents = detectIntents(value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setFocused(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200",
        focused ? "border-primary/25 bg-card shadow-[0_0_0_3px_oklch(0.6_0.16_45/0.06)]" : "border-border/50 bg-card shadow-[var(--shadow-card)]"
      )}>
        <Search className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          autoFocus={autoFocus}
          placeholder="搜索产品、粘贴链接、或写下你的想法..."
          className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/35"
        />
        {value && <button onClick={() => setValue("")} className="text-muted-foreground/30 hover:text-muted-foreground text-sm">&times;</button>}
      </div>
      {focused && intents.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-border/50 bg-card shadow-[var(--shadow-elevated)] overflow-hidden z-50">
          {intents.map((intent) => (
            <button key={intent.type} className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/40" onClick={() => setFocused(false)}>
              <span className={intent.primary ? "text-primary" : "text-muted-foreground/60"}>{intent.icon}</span>
              <span className={cn("flex-1", intent.primary && "font-medium")}>{intent.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
