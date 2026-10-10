import { z } from "zod";

export const courseRoomInput = z.object({
  name: z.string().trim().min(1, "請填寫教室名稱").max(80),
  category: z.string().trim().max(40).default(""),
  capacity: z.number().int().min(1).max(500).nullable().default(null),
  details: z.string().trim().max(5000).default(""),
  equipment: z.string().trim().max(1000).default(""),
  location: z.string().trim().max(500).default(""),
  rentalEnabled: z.boolean().default(false),
  rentalHourlyRate: z.number().int().min(0).max(1000000).default(0),
  rentalBufferMinutes: z.number().int().min(0).max(120).default(0),
});
export const courseRoomCreateInput = courseRoomInput.extend({
  expectedStoreId: z.string().min(1).max(100),
  requestKey: z.string().uuid(),
});
export type CourseRoomCreateInput = z.infer<typeof courseRoomCreateInput>;
export type CreatedCourseRoom = z.infer<typeof courseRoomInput> & { id: string; isActive: boolean };
export const COURSE_ROOM_SAVED = "course-room-saved";
