import { z } from "zod";
import { sportsTeachingRule } from "./sports-teaching-rule";

export const musicSubjectValues = z.object({
  name: z.string().trim().min(1).max(80), category: z.string().trim().max(40).default(""),
  description: z.string().trim().max(5000).default(""), isActive: z.boolean(),
});
export const musicNativeSubjectDefaults=z.object({durationMinutes:z.number().int().min(1).max(480),visibility:z.enum(["PUBLIC","HIDDEN","OFF"]),precautions:z.string().trim().max(5000).default("")});
export const musicSubjectSaveInput = musicSubjectValues.extend({
  nativeDefaults:musicNativeSubjectDefaults.optional(),
  sportsRule: sportsTeachingRule.optional(),
  id: z.string().min(1).max(100).optional(), expectedUpdatedAt: z.string().datetime().optional(),
  expectedStoreId: z.string().min(1).max(100), requestKey: z.string().uuid(),
});
export const savedMusicSubject = musicSubjectValues.extend({ durationMinutes:z.number().int().optional(),visibility:z.string().optional(),precautions:z.string().optional(),sportsRule: sportsTeachingRule.optional(), id: z.string().min(1), updatedAt: z.string().datetime() });
export const SETTINGS_SAVED = "course-settings-saved";
