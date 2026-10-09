import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { coursePointCard: m } }));
import { getCoursePlanHistory } from "@/server/queries/course-plan-history";
beforeEach(() => vi.resetAllMocks());
describe("authorized plan lesson history", () => {
  it("does not query without an authorized card", async () => {
    expect(await getCoursePlanHistory("store", "member", [], new Date())).toEqual([]);
    expect(m.findMany).not.toHaveBeenCalled();
  });
  it("scopes history to store and member, keeps lesson time and the existing debit rules", async () => {
    const row = (status: string, absenceKind: string | null = null) => ({id:status+absenceKind,customerName:"家人",status,absenceKind,pointCost:2,session:{startsAt:new Date("2026-09-18T04:00:00Z"),nameSnapshot:"基礎伸展"}});
    m.findMany.mockResolvedValue([{id:"card",_count:{bookings:103},bookings:[row("ATTENDED"),row("NO_SHOW"),row("CANCELLED"),row("RESERVED"),row("CANCELLED","STUDENT_LEAVE"),row("CANCELLED","GROUP_LEAVE_FORFEITED"),row("CANCELLED","TEACHER_ABSENT")]}]);
    const now = new Date("2026-10-09T12:00:00Z");
    const [result] = await getCoursePlanHistory("store", "member", ["card"], now);
    const query = m.findMany.mock.calls[0][0];
    expect(query.where).toEqual({storeId:"store",id:{in:["card"]},members:{some:{customerId:"member"}}});
    expect(query.select.bookings.where).toEqual({storeId:"store",session:{startsAt:{lte:now}}});
    expect(query.select.bookings.take).toBe(100);
    expect(result.count).toBe(103);
    expect(result.lessons[0]).toMatchObject({startsAt:"2026-09-18T04:00:00.000Z",name:"基礎伸展",customerName:"家人"});
    expect(result.lessons.map(item => item.used)).toEqual([2,2,0,0,0,2,0]);
    expect(result.lessons.map(item => item.status)).toEqual(["已出席","未到","已取消","待確認出席","請假","請假","教師未授課"]);
    expect(query.select.bookings.select).not.toHaveProperty("notes");
  });
});
