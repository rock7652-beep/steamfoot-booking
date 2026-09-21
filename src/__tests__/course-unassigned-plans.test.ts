import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ raw: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: m.raw } }));
import { courseUnassignedPlanWhere, getCourseUnassignedPlanCount, getCourseUnassignedPlanPage } from "@/server/queries/course-unassigned-plans";
beforeEach(() => { vi.resetAllMocks(); });
describe("unassigned course plans, same store and same history rule", () => {
  it("uses all card membership history, not active card balances or just the buyer", () => {
    const q = courseUnassignedPlanWhere("a", null);
    expect(q.sql).toContain('"CourseCardMember"'); expect(q.sql).toContain('k."storeId"=m."storeId"'); expect(q.sql).toContain('m."customerId"=c.id');
    for (const wrong of ['k.remaining', 'k."expiresAt"', 'k."closedAt"']) expect(q.sql).not.toContain(wrong);
    expect(q.sql).toContain("'PENDING','CONFIRMED','REFUNDED'"); expect(q.sql).toContain('p."cardId" IS NOT NULL'); expect(q.sql).toContain('b."cardId" IS NOT NULL');
  });
  it("excludes suspended, merged and coach-only accounts and enforces manager visibility", () => {
    const q = courseUnassignedPlanWhere("a", "manager-a");
    expect(q.sql).toContain('c."mergedIntoCustomerId" IS NULL'); expect(q.sql).toContain("u.status='ACTIVE'"); expect(q.sql).toContain('l."courseMemberEnabled"=false'); expect(q.sql).toContain('c."assignedStaffId"='); expect(q.values).toEqual(["a", "manager-a"]);
    for (const alias of ["l", "m", "p", "b"]) expect(q.sql).toContain(`${alias}."storeId"=c."storeId"`);
  });
  it("only transports the count to the home and shares the exact page predicate", async () => {
    m.raw.mockResolvedValueOnce([{ total: 42 }]).mockResolvedValueOnce([{ total: 42, page: 2, rows: [] }]);
    expect(await getCourseUnassignedPlanCount("a", null)).toBe(42); expect((await getCourseUnassignedPlanPage("a", null, 2)).pageSize).toBe(30);
    const [count, page] = m.raw.mock.calls.map(call => call[0]); expect(count.sql).toContain("count(*)::int"); expect(count.sql).not.toContain('c.name');
    expect(count.sql).toContain(courseUnassignedPlanWhere("a", null).sql); expect(page.sql).toContain(courseUnassignedPlanWhere("a", null).sql);
    expect(page.sql).toContain('ORDER BY "createdAt",id'); expect(page.sql).toContain('RIGHT(c.phone,4)'); expect(page.sql).toContain('LEAST(');
  });
  it.each([NaN, Infinity, -1, 0, 1.9])("normalizes invalid page %s without unbounded transport", async page => {
    m.raw.mockResolvedValue([{ total: 0, page: 1, rows: [] }]); await getCourseUnassignedPlanPage("a", null, page);
    expect(m.raw.mock.calls[0][0].values).toEqual(["a", 1, 30, 30, 30]);
  });
  it("does not replace query failure with an apparently empty successful list", async () => {
    m.raw.mockRejectedValue(new Error("offline")); await expect(getCourseUnassignedPlanCount("a", null)).rejects.toThrow("offline"); await expect(getCourseUnassignedPlanPage("a", null)).rejects.toThrow("offline");
  });
});
