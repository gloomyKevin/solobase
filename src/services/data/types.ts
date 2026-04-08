import type {
  Project,
  ProjectFilters,
  Pagination,
  ProjectListResult,
} from "@/types";
import type { Founder } from "@/types/founder";
import type { Submission } from "@/types/submission";
import type { Feedback } from "@/types/feedback";

export interface DataService {
  // Projects
  listProjects(
    filters?: ProjectFilters,
    pagination?: Partial<Pagination>
  ): Promise<ProjectListResult>;
  getProject(slug: string): Promise<Project | null>;
  getRelatedProjects(
    projectSlug: string,
    dimension: "track" | "growth" | "founder",
    limit?: number
  ): Promise<Project[]>;

  // Founders
  getFounder(id: string): Promise<Founder | null>;

  // Submissions
  createSubmission(
    data: Omit<Submission, "id" | "submittedAt">
  ): Promise<Submission>;

  // Feedback
  createFeedback(data: Omit<Feedback, "id" | "submittedAt">): Promise<Feedback>;
}
