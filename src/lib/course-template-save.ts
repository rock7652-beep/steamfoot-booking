import { z } from "zod";
import { courseTemplateInput } from "@/lib/course-scheduling";

export const courseTemplateSaveInput = courseTemplateInput.extend({
  id: z.string().min(1).max(100).optional(),
  expectedStoreId: z.string().min(1).max(100),
  requestKey: z.string().uuid(),
  expectedRevision: z.string().max(30000).optional(),
}).refine(row => !row.id || !!row.expectedRevision);

const templateState = courseTemplateInput.extend({
  isActive: z.boolean().default(true),
  visibility: z.enum(["PUBLIC", "HIDDEN", "OFF"]).default("PUBLIC"),
  musicSubjectId: z.string().nullable().default(null),
});

export const savedCourseTemplate = templateState.extend({
  id: z.string(),
  musicSubject: z.object({id:z.string(), name:z.string(), isActive:z.boolean()}).nullable(),
  hasSessions: z.boolean(),
  revision: z.string(),
});

/** Only editable configuration and publication state participate, not live bookings. */
export function courseTemplateRevision(row: unknown) {
  return JSON.stringify(templateState.parse(row));
}
