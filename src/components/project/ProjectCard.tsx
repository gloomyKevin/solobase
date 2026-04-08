"use client";

import { cn } from "@/lib/utils";
import { TagBadge, type TagDimension } from "@/components/common/TagBadge";
import { motion } from "framer-motion";
import Link from "next/link";

export interface ProjectCardData {
  slug: string;
  name: string;
  tagline: string;
  screenshot: string;
  tags: { label: string; dimension: TagDimension }[];
  stage: string;
  stageColor: string;
  featuredInsight?: string;
  isEditorsPick?: boolean;
}

interface ProjectCardProps {
  project: ProjectCardData;
  variant?: "default" | "featured" | "compact" | "hero" | "minimal";
  className?: string;
}

export function ProjectCard({
  project,
  variant = "default",
  className,
}: ProjectCardProps) {
  // Hero variant — large card with overlay text
  if (variant === "hero") {
    return (
      <Link href={`/project/${project.slug}`}>
        <motion.article
          whileHover={{ y: -3 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={cn(
            "group relative overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow",
            project.isEditorsPick && "ring-2 ring-highlight/15",
            className
          )}
        >
          <div className="relative aspect-[16/10] overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-[1.03]"
              style={{ backgroundImage: `url(${project.screenshot})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            {project.isEditorsPick && (
              <div className="absolute top-3 left-3 bg-highlight text-highlight-foreground text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
                编辑精选
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <h3 className="text-lg font-bold text-white leading-snug">
                {project.name}
              </h3>
              <p className="mt-1 text-sm text-white/80 line-clamp-1">
                {project.tagline}
              </p>
              {project.featuredInsight && (
                <p className="mt-2 text-xs text-white/60 italic line-clamp-2">
                  &ldquo;{project.featuredInsight}&rdquo;
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {project.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.label}
                    className="inline-flex items-center rounded-full bg-white/15 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-white/90"
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.article>
      </Link>
    );
  }

  // Minimal variant — tiny row card for masonry
  if (variant === "minimal") {
    return (
      <Link href={`/project/${project.slug}`}>
        <motion.article
          whileHover={{ y: -1 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={cn(
            "group flex items-center gap-3 rounded-xl bg-card p-3 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow",
            className
          )}
        >
          <div
            className="h-10 w-10 shrink-0 rounded-lg bg-cover bg-center bg-muted"
            style={{ backgroundImage: `url(${project.screenshot})` }}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate">{project.name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {project.tagline}
            </p>
          </div>
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: project.stageColor }}
          />
        </motion.article>
      </Link>
    );
  }

  const isCompact = variant === "compact";

  return (
    <Link href={`/project/${project.slug}`}>
      <motion.article
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn(
          "group relative overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow duration-250",
          project.isEditorsPick &&
            "ring-2 ring-highlight/15",
          className
        )}
      >
        {project.isEditorsPick && (
          <div className="absolute top-3 right-3 z-10 bg-highlight text-highlight-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full">
            编辑精选
          </div>
        )}

        <div
          className={cn(
            "relative overflow-hidden bg-muted",
            isCompact ? "aspect-[16/9]" : "aspect-[16/10]"
          )}
        >
          <div
            className="w-full h-full bg-cover bg-center bg-no-repeat transition-transform duration-300 group-hover:scale-[1.02]"
            style={{ backgroundImage: `url(${project.screenshot})` }}
          />
        </div>

        <div className={cn("p-5", isCompact && "p-4")}>
          <h3
            className={cn(
              "font-semibold leading-snug truncate",
              isCompact ? "text-base" : "text-lg"
            )}
          >
            {project.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
            {project.tagline}
          </p>

          {project.featuredInsight && variant === "featured" && (
            <div className="mt-3 pl-3 border-l-2 border-primary/40">
              <p className="text-sm italic text-foreground/80 line-clamp-2">
                &ldquo;{project.featuredInsight}&rdquo;
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.tags.slice(0, isCompact ? 2 : 3).map((tag) => (
              <TagBadge
                key={tag.label}
                label={tag.label}
                dimension={tag.dimension}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: project.stageColor }}
            />
            <span className="text-xs text-muted-foreground">
              {project.stage}
            </span>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
