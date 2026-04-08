import { z } from "zod/v4";
import { FounderTypeValues } from "./project";

export const FounderSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  bio: z.string().optional(),
  backgroundType: z.enum(FounderTypeValues).default("undetermined"),

  socialLinks: z
    .object({
      website: z.string().optional(),
      twitter: z.string().optional(),
      jike: z.string().optional(),
      github: z.string().optional(),
      xiaohongshu: z.string().optional(),
      wechat: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),

  projectIds: z.array(z.string()).default([]),

  claimedAt: z.string().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type Founder = z.infer<typeof FounderSchema>;
