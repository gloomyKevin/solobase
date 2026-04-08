"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import {
  businessModelOptions,
  buildEffortOptions,
  growthChannelOptions,
  founderTypeOptions,
  projectStageOptions,
} from "@/config/categories";

interface FilterGroup {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

const filterGroups: FilterGroup[] = [
  { key: "model", label: "商业模式", options: businessModelOptions.filter((o) => o.value !== "undetermined") },
  { key: "effort", label: "构建门槛", options: buildEffortOptions.filter((o) => o.value !== "undetermined") },
  { key: "growth", label: "增长方式", options: growthChannelOptions.filter((o) => o.value !== "undetermined") },
  { key: "founder", label: "创始人类型", options: founderTypeOptions.filter((o) => o.value !== "undetermined") },
  { key: "stage", label: "产品阶段", options: projectStageOptions },
];

export function ProjectFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const getActiveValues = useCallback(
    (key: string): string[] => {
      const val = searchParams.get(key);
      return val ? val.split(",") : [];
    },
    [searchParams]
  );

  const toggleFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.get(key)?.split(",").filter(Boolean) ?? [];

      if (current.includes(value)) {
        const next = current.filter((v) => v !== value);
        if (next.length === 0) {
          params.delete(key);
        } else {
          params.set(key, next.join(","));
        }
      } else {
        params.set(key, [...current, value].join(","));
      }

      router.push(`/browse?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setSearch = useCallback(
    (q: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) {
        params.set("q", q);
      } else {
        params.delete("q");
      }
      router.push(`/browse?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const clearAll = useCallback(() => {
    router.push("/browse", { scroll: false });
  }, [router]);

  const hasFilters = searchParams.toString().length > 0;
  const searchQuery = searchParams.get("q") ?? "";

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="搜索产品名称..."
          defaultValue={searchQuery}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setSearch((e.target as HTMLInputElement).value);
            }
          }}
          className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Filter chips */}
      {filterGroups.map((group) => (
        <div key={group.key}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((option) => {
              const active = getActiveValues(group.key).includes(option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => toggleFilter(group.key, option.value)}
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border/60 bg-card text-foreground/70 hover:border-primary/30 hover:text-primary"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Tag filters (from URL) */}
      {searchParams.get("tag") && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            标签筛选
          </p>
          <div className="flex flex-wrap gap-1.5">
            {searchParams
              .get("tag")!
              .split(",")
              .map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium"
                >
                  {tag}
                  <button
                    onClick={() => {
                      const params = new URLSearchParams(searchParams.toString());
                      const tags = params.get("tag")?.split(",").filter((t) => t !== tag) ?? [];
                      if (tags.length === 0) params.delete("tag");
                      else params.set("tag", tags.join(","));
                      router.push(`/browse?${params.toString()}`, { scroll: false });
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          清除所有筛选
        </button>
      )}
    </div>
  );
}
