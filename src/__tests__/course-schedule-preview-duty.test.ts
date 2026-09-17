import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ raw: vi.fn(), sessions: vi.fn(), room: vi.fn(), manager: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { $queryRaw: mocks.raw, courseSession: { findMany: mocks.sessions }, courseRoom: { findFirst: mocks.room } } }));
vi.mock("@/server/services/course-access", () => ({ courseManager: mocks.manager }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { previewCourseSchedule } from "@/server/actions/course";
const input = { templateId: "class", roomId: "room", coachId: "coach", date: "2026-10-01", time: "09:30", durationMinutes: 90, capacity: 2, requestKey: "00000000-0000-4000-8000-000000000001" };
beforeEach(() => { vi.resetAllMocks(); mocks.manager.mockResolvedValue({ storeId: "shop" }); mocks.sessions.mockResolvedValue([]); mocks.room.mockResolvedValue({ capacity: 2 }); });
it("does not advertise a course as schedulable when the coach covers only its start", async () => {
 mocks.raw.mockImplementation(async (parts: TemplateStringsArray) => {
  const sql = parts.join("");
  if (sql.includes("ShopConfig")) return [{ dutySchedulingEnabled: true }];
  if (sql.includes("BusinessHours")) return [{ dayOfWeek: 4, isOpen: true, openTime: "09:00", closeTime: "12:00", slotInterval: 60 }];
  if (sql.includes("DutyAssignment")) return [{ date: new Date("2026-10-01T00:00:00Z"), staffId: "coach", slotTime: "09:00" }];
  return [];
 });
 const result = await previewCourseSchedule(input);
 expect(result.success).toBe(false);
 expect(JSON.stringify(result)).toContain("值班未涵蓋完整課程時段");
});
it("retains normal scheduling with duty integration off", async () => {
 mocks.raw.mockResolvedValue([]);
 const result = await previewCourseSchedule(input);
 expect(result).toMatchObject({ success: true, data: { dates: [{ conflict: false }] } });
});
