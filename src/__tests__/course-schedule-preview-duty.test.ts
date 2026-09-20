import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ raw: vi.fn(), sessions: vi.fn(), room: vi.fn(), manager: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { $queryRaw: mocks.raw, courseSession: { findMany: mocks.sessions }, courseTemplate:{findFirst:async()=>({id:"class",isActive:true,visibility:"PUBLIC"})}, courseRoom: { findFirst: mocks.room } } }));
vi.mock("@/server/services/course-access", () => ({ courseManager: mocks.manager }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { previewCourseSchedule } from "@/server/actions/course";
const input = { templateId: "class", roomId: "room", coachId: "coach", date: "2026-10-01", time: "09:30", durationMinutes: 90, capacity: 2, requestKey: "00000000-0000-4000-8000-000000000001" };
beforeEach(() => { vi.resetAllMocks(); mocks.manager.mockResolvedValue({ storeId: "shop" }); mocks.sessions.mockResolvedValue([]); mocks.room.mockResolvedValue({ capacity: 2 }); });
it("does not advertise a course as schedulable when the coach covers only its start", async () => {
 mocks.raw.mockImplementation(async (parts: TemplateStringsArray) => {
  const sql = parts.join("");
  if(sql.includes("courseCoachEnabled")) return [{courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:["class"]}];
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
 mocks.raw.mockImplementation(async(parts:TemplateStringsArray)=>parts.join("").includes("courseCoachEnabled")?[{courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:["class"]}]:[]);
 const result = await previewCourseSchedule(input);
 expect(result).toMatchObject({ success: true, data: { dates: [{ conflict: false }] } });
});
it("names both conflicting resources and excludes adjacent sessions from the preview", async () => {
 mocks.raw.mockImplementation(async(parts:TemplateStringsArray)=>parts.join("").includes("courseCoachEnabled")?[{courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:["class"]}]:[]);
 mocks.sessions.mockResolvedValue([
  {startsAt:new Date("2026-10-01T01:00:00Z"),endsAt:new Date("2026-10-01T02:00:00Z"),roomId:"room",coachId:"coach",nameSnapshot:"伸展瑜珈"},
  {startsAt:new Date("2026-10-01T03:00:00Z"),endsAt:new Date("2026-10-01T04:00:00Z"),roomId:"room",coachId:"other",nameSnapshot:"接續課"},
 ]);
 const result=await previewCourseSchedule(input);
 expect(result).toMatchObject({success:true,data:{dates:[{conflict:true,conflicts:[{name:"伸展瑜珈",resource:"教室及教練",startsAt:"2026-10-01T01:00:00.000Z"}]}]}});
 if(result.success) expect(result.data.dates[0].conflicts).toHaveLength(1);
 expect(mocks.sessions.mock.calls[0][0].where.storeId).toBe("shop");
});
