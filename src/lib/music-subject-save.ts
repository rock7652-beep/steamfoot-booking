import { z } from "zod";

export const musicSubjectValues = z.object({
  name: z.string().trim().min(1).max(80), category: z.string().trim().max(40).default(""),
  description: z.string().trim().max(5000).default(""), isActive: z.boolean(),
});
export const musicSubjectSaveInput = musicSubjectValues.extend({
  id: z.string().min(1).max(100).optional(), expectedUpdatedAt: z.string().datetime().optional(),
  expectedStoreId: z.string().min(1).max(100), requestKey: z.string().uuid(),
});
export const savedMusicSubject = musicSubjectValues.extend({ id: z.string().min(1), updatedAt: z.string().datetime() });
export const SETTINGS_SAVED = "course-settings-saved";
