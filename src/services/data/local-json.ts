import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import os from "os";
import type { DataService } from "./types";
import type {
  Project,
  ProjectFilters,
  Pagination,
  ProjectListResult,
} from "@/types";
import type { Founder } from "@/types/founder";
import type { Submission } from "@/types/submission";
import type { Feedback } from "@/types/feedback";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_WRITE_DIR =
  process.env.SOLOBASE_DATA_WRITE_DIR ||
  process.env.DATA_WRITE_DIR ||
  path.join(os.tmpdir(), "solobase");

// Simple in-memory cache for the index
let indexCache: IndexEntry[] | null = null;
let indexMtime: number = 0;

interface IndexEntry {
  slug: string;
  name: string;
  status: string;
  businessModel: string;
  buildEffort: string;
  growthChannel: string;
  founderType: string;
  stage: string;
  tags: string[];
  isEditorsPick: boolean;
  publishedAt: string;
}

async function readIndex(): Promise<IndexEntry[]> {
  const indexPath = path.join(DATA_DIR, "projects", "_index.json");
  try {
    const stat = await fs.stat(indexPath);
    if (indexCache && stat.mtimeMs === indexMtime) {
      return indexCache;
    }
    const raw = await fs.readFile(indexPath, "utf-8");
    indexCache = JSON.parse(raw) as IndexEntry[];
    indexMtime = stat.mtimeMs;
    return indexCache;
  } catch {
    return [];
  }
}

async function readProject(slug: string): Promise<Project | null> {
  const filePath = path.join(DATA_DIR, "projects", `${slug}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

function matchesFilters(entry: IndexEntry, filters: ProjectFilters): boolean {
  if (filters.status?.length && !filters.status.includes(entry.status as never)) {
    return false;
  }
  if (
    filters.businessModel?.length &&
    !filters.businessModel.includes(entry.businessModel as never)
  ) {
    return false;
  }
  if (
    filters.buildEffort?.length &&
    !filters.buildEffort.includes(entry.buildEffort as never)
  ) {
    return false;
  }
  if (
    filters.growthChannel?.length &&
    !filters.growthChannel.includes(entry.growthChannel as never)
  ) {
    return false;
  }
  if (
    filters.founderType?.length &&
    !filters.founderType.includes(entry.founderType as never)
  ) {
    return false;
  }
  if (
    filters.stage?.length &&
    !filters.stage.includes(entry.stage as never)
  ) {
    return false;
  }
  if (filters.tags?.length) {
    const hasTag = filters.tags.some((t) => entry.tags.includes(t));
    if (!hasTag) return false;
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack = `${entry.name} ${entry.slug}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function hasProjectLevelFilters(filters: ProjectFilters): boolean {
  return Boolean(
    filters.revenueRange?.length ||
      filters.taskScenario?.length ||
      filters.market?.length ||
      filters.platform?.length
  );
}

function matchesProjectLevelFilters(
  project: Project,
  filters: ProjectFilters
): boolean {
  if (
    filters.revenueRange?.length &&
    !filters.revenueRange.includes(project.metrics?.revenueRange?.value as never)
  ) {
    return false;
  }
  if (
    filters.taskScenario?.length &&
    !filters.taskScenario.some((value) => project.tags.taskScenario.includes(value))
  ) {
    return false;
  }
  if (
    filters.market?.length &&
    !filters.market.some((value) => project.tags.market.includes(value))
  ) {
    return false;
  }
  if (
    filters.platform?.length &&
    !filters.platform.some((value) => project.tags.platform.includes(value))
  ) {
    return false;
  }
  return true;
}

function sortEntries(
  entries: IndexEntry[],
  sortBy: string
): IndexEntry[] {
  const sorted = [...entries];
  switch (sortBy) {
    case "newest":
      sorted.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
      break;
    case "oldest":
      sorted.sort(
        (a, b) =>
          new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
      );
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return sorted;
}

export function createLocalJsonDataService(): DataService {
  return {
    async listProjects(
      filters: ProjectFilters = {},
      pagination: Partial<Pagination> = {}
    ): Promise<ProjectListResult> {
      const index = await readIndex();
      const page = pagination.page ?? 1;
      const pageSize = pagination.pageSize ?? 20;
      const sortBy = pagination.sortBy ?? "newest";

      // Filter
      let filtered = index.filter((entry) => matchesFilters(entry, filters));

      // Also do text search against full project data if search is present
      // but for MVP we search the index only (name + slug)
      if (filters.search) {
        const q = filters.search.toLowerCase();
        // Expand search: load all projects and check tagline too
        const expandedResults: IndexEntry[] = [];
        for (const entry of index) {
          const haystack = `${entry.name} ${entry.slug}`.toLowerCase();
          if (haystack.includes(q)) {
            expandedResults.push(entry);
            continue;
          }
          // Check tagline from full project data
          const project = await readProject(entry.slug);
          if (
            project &&
            project.tagline.toLowerCase().includes(q)
          ) {
            expandedResults.push(entry);
          }
        }
        filtered = expandedResults.filter((entry) => {
          // Re-apply non-search filters
          const filtersWithoutSearch = { ...filters, search: undefined };
          return matchesFilters(entry, filtersWithoutSearch);
        });
      }

      const projectCache = new Map<string, Project>();
      if (hasProjectLevelFilters(filters)) {
        const matchedEntries: IndexEntry[] = [];

        for (const entry of filtered) {
          const project = await readProject(entry.slug);
          if (!project || !matchesProjectLevelFilters(project, filters)) {
            continue;
          }
          projectCache.set(entry.slug, project);
          matchedEntries.push(entry);
        }

        filtered = matchedEntries;
      }

      // Sort
      const sorted = sortEntries(filtered, sortBy);

      // Paginate
      const total = sorted.length;
      const start = (page - 1) * pageSize;
      const pageEntries = sorted.slice(start, start + pageSize);

      // Load full project data for the page
      const items: Project[] = [];
      for (const entry of pageEntries) {
        const project = projectCache.get(entry.slug) ?? await readProject(entry.slug);
        if (project) items.push(project);
      }

      return { items, total, page, pageSize };
    },

    async getProject(slug: string): Promise<Project | null> {
      return readProject(slug);
    },

    async getRelatedProjects(
      projectSlug: string,
      dimension: "track" | "growth" | "founder",
      limit = 3
    ): Promise<Project[]> {
      const index = await readIndex();
      const current = index.find((e) => e.slug === projectSlug);
      if (!current) return [];

      const related = index.filter((entry) => {
        if (entry.slug === projectSlug) return false;
        switch (dimension) {
          case "track":
            return entry.tags.some((t) => current.tags.includes(t));
          case "growth":
            return entry.growthChannel === current.growthChannel;
          case "founder":
            return entry.founderType === current.founderType;
          default:
            return false;
        }
      });

      const slugs = related.slice(0, limit).map((e) => e.slug);
      const projects: Project[] = [];
      for (const slug of slugs) {
        const p = await readProject(slug);
        if (p) projects.push(p);
      }
      return projects;
    },

    async getFounder(id: string): Promise<Founder | null> {
      const filePath = path.join(DATA_DIR, "founders", `${id}.json`);
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        return JSON.parse(raw) as Founder;
      } catch {
        return null;
      }
    },

    async createSubmission(
      data: Omit<Submission, "id" | "submittedAt">
    ): Promise<Submission> {
      const submission: Submission = {
        ...data,
        id: crypto.randomUUID(),
        submittedAt: new Date().toISOString(),
      } as Submission;

      const dir = path.join(DATA_WRITE_DIR, "submissions");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, `${submission.id}.json`),
        JSON.stringify(submission, null, 2)
      );
      return submission;
    },

    async createFeedback(
      data: Omit<Feedback, "id" | "submittedAt">
    ): Promise<Feedback> {
      const feedback: Feedback = {
        ...data,
        id: crypto.randomUUID(),
        submittedAt: new Date().toISOString(),
      } as Feedback;

      const dir = path.join(DATA_WRITE_DIR, "feedback");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, `${feedback.id}.json`),
        JSON.stringify(feedback, null, 2)
      );
      return feedback;
    },
  };
}
