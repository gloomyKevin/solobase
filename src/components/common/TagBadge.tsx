import { cn } from "@/lib/utils";

export type TagDimension =
  | "business"
  | "growth"
  | "effort"
  | "founder"
  | "stage"
  | "default";

const dimensionStyles: Record<TagDimension, string> = {
  business: "bg-tag-business-bg text-tag-business-text",
  growth: "bg-tag-growth-bg text-tag-growth-text",
  effort: "bg-tag-effort-bg text-tag-effort-text",
  founder: "bg-tag-founder-bg text-tag-founder-text",
  stage: "bg-tag-stage-bg text-tag-stage-text",
  default: "bg-tag-default-bg text-tag-default-text",
};

interface TagBadgeProps {
  label: string;
  dimension?: TagDimension;
  className?: string;
}

export function TagBadge({
  label,
  dimension = "default",
  className,
}: TagBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-80",
        dimensionStyles[dimension],
        className
      )}
    >
      {label}
    </span>
  );
}
