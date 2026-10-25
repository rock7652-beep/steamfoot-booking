import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/course-db", () => ({ coursePrisma: {} }));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: vi.fn() }));
import type { Prisma } from "../../generated/course-client";
import { changeOpeningMakeupInTransaction, type OpeningMakeupCommand } from "@/server/services/music-opening-makeup";
import { makeupRecord } from "./fixtures/music-opening-makeup";
import { musicOpeningMakeupSourceKey, musicOpeningMakeupSourceSlotKey, musicOpeningMakeupContentHash } from "@/lib/music-opening-makeup";
const actor = { storeId: "synthetic-store", userId: "synthetic-actor", name: "Synthetic manager" };
const reserve: OpeningMakeupCommand = { entitlementId: "right", expectedVersion: 0, requestKey: "request-1", action: "RESERVE", sessionId: "session", bookingId: null, expectedStatus: null, actualAttendance: false, reason: "" };
function setup() {
  const snapshot = makeupRecord();
  const right = { id: "right", storeId: actor.storeId, customerId: "synthetic-student", templateId: "synthetic-template", sourceKey: musicOpeningMakeupSourceKey(snapshot), sourceSlotKey: musicOpeningMakeupSourceSlotKey(snapshot), contentHash: musicOpeningMakeupContentHash(snapshot), snapshot, version: 0 };
  const session = { id: "session", storeId: actor.storeId, templateId: right.templateId, startsAt: new Date("2026-10-09T02:00:00Z"), endsAt: new Date("2026-10-09T03:00:00Z"), template: { isActive: true, visibility: "PUBLIC", classType: "PRIVATE" }, cancelledAt: null, releasedAt: null, capacity: 2, teacherAttendance: "SCHEDULED" };
  const bookings: Array<Record<string, unknown>> = [];
  const receipts: Array<{ afterJson: { requestHash: string; result: unknown } }> = [];
  const tx = {
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "AuditLog"')) return receipts;
      if (sql.includes('FROM "StoreFeatureEntitlement"')) return [{ featureKey: "business.music" }];
      if (sql.includes('FROM "Customer"')) return [{ id: right.customerId, name: "Synthetic learner" }];
      if (sql.includes('AS closed')) return [{ closed: false }];
      return [{ id: actor.storeId }];
    }),
    $executeRaw: vi.fn(async (_parts: TemplateStringsArray, ...values: unknown[]) => { receipts.push({ afterJson: JSON.parse(values[5] as string) }); return 1; }),
    courseMusicOpeningMakeupEntitlement: { findFirst: vi.fn(async () => right), updateMany: vi.fn(async () => { right.version++; return { count: 1 }; }) },
    courseSession: { findFirst: vi.fn(async () => session) },
    courseBookingRule: { findUnique: vi.fn(async () => ({ bookingLeadMinutes: 0 })) },
    courseBooking: {
      findMany: vi.fn(async () => bookings.filter(b => b.status !== "CANCELLED")),
      findFirst: vi.fn(async (args: { where: { id?: string } }) => args.where.id ? bookings.find(b => b.id === args.where.id) ?? null : null),
      count: vi.fn(async () => bookings.filter(b => b.status !== "CANCELLED").length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const b = { id: "booking", ...data, session }; bookings.push(b); return b; }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(bookings[0], data); return bookings[0]; }),
    },
  };
  const run = (command = reserve) => changeOpeningMakeupInTransaction(tx as unknown as Prisma.TransactionClient, actor, command, null);
  return { tx, right, session, bookings, receipts, run };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T02:00:00Z")); });
afterEach(() => vi.useRealTimers());
describe("dedicated opening lifecycle service", () => {
  it("reserves cardless, zero-point and preserves immutable source", async () => {
    const f = setup(), before = JSON.stringify(f.right.snapshot); await f.run();
    expect(f.bookings[0]).toMatchObject({ bookingKind: "OPENING_MAKEUP", cardId: null, pointCost: 0, status: "RESERVED", musicOpeningMakeupEntitlementId: "right" });
    expect(f.right.version).toBe(1); expect(JSON.stringify(f.right.snapshot)).toBe(before); expect(f.tx.$executeRaw).toHaveBeenCalledOnce();
    expect(f.tx.$queryRaw.mock.calls[0][0].join("?")).toContain('FROM "Store"');
    expect(f.tx.$queryRaw.mock.calls.some(call => call[0].join("?").includes('"CourseMusicOpeningMakeupEntitlement"') && call[0].join("?").includes('FOR UPDATE'))).toBe(true);
  });
  it("exact request replay returns original outcome without another mutation", async () => {
    const f = setup(), original = await f.run(); expect(await f.run()).toEqual(original); expect(f.tx.courseBooking.create).toHaveBeenCalledOnce(); expect(f.right.version).toBe(1);
    await expect(f.run({ ...reserve, sessionId: "other" })).rejects.toThrow("操作編號");
  });
  it("stale version rejects before a booking write", async () => { const f = setup(); f.right.version = 2; await expect(f.run()).rejects.toThrow("另一個操作"); expect(f.tx.courseBooking.create).not.toHaveBeenCalled(); });
  it("attends then correction restores the same held right", async () => {
    const f = setup(); await f.run(); f.receipts.length = 0; f.session.startsAt = new Date("2026-10-07T02:00:00Z");
    const attend: OpeningMakeupCommand = { ...reserve, requestKey: "attend", action: "ATTEND", bookingId: "booking", sessionId: null, expectedStatus: "RESERVED", expectedVersion: 1, actualAttendance: true };
    await f.run(attend); expect(f.bookings[0].status).toBe("ATTENDED"); f.receipts.length = 0;
    await f.run({ ...attend, requestKey: "correct", action: "CORRECT_TO_RESERVED", expectedStatus: "ATTENDED", expectedVersion: 2, actualAttendance: false, reason: "Synthetic correction" });
    expect(f.bookings[0].status).toBe("RESERVED"); expect(f.right.version).toBe(3); expect(f.tx.courseBooking.create).toHaveBeenCalledOnce();
  });
  it.each(["CANCEL", "TEACHER_ABSENT"] as const)("%s releases without another right, session update or ledger", async action => {
    const f = setup(); await f.run(); f.receipts.length = 0;
    await f.run({ ...reserve, requestKey: action, action, sessionId: null, bookingId: "booking", expectedStatus: "RESERVED", expectedVersion: 1, reason: "Synthetic cancellation" });
    expect(f.bookings[0].status).toBe("CANCELLED"); expect(f.right.version).toBe(2); expect(f.tx.courseBooking.create).toHaveBeenCalledOnce(); expect(f.session.teacherAttendance).toBe("SCHEDULED");
  });
  it("check-in stays reserved and does not stand for attendance", async () => {
    const f = setup(); await f.run(); f.receipts.length = 0;
    await f.run({ ...reserve, requestKey: "checkin", action: "CHECK_IN", sessionId: null, bookingId: "booking", expectedStatus: "RESERVED", expectedVersion: 1 });
    expect(f.bookings[0]).toMatchObject({ status: "RESERVED", checkedInAt: new Date("2026-10-08T02:00:00Z") });
  });
  it.each([false, true])("refuses future attendance (confirmation=%s)", async actualAttendance => {
    const f = setup(); await f.run(); f.receipts.length = 0;
    await expect(f.run({ ...reserve, requestKey: "attend", action: "ATTEND", sessionId: null, bookingId: "booking", expectedStatus: "RESERVED", expectedVersion: 1, actualAttendance })).rejects.toThrow();
    expect(f.bookings[0].status).toBe("RESERVED");
  });
  it("rejects unknown no-show policy, mismatched source hash, expiry and member actor", async () => {
    const f = setup(); await expect(f.run({ ...reserve, action: "NO_SHOW" } as unknown as OpeningMakeupCommand)).rejects.toThrow();
    f.right.contentHash = "a".repeat(64); await expect(f.run()).rejects.toThrow("待核對");
    await expect(changeOpeningMakeupInTransaction(f.tx as unknown as Prisma.TransactionClient, { ...actor, customerId: "synthetic-student" }, reserve, null)).rejects.toThrow("有權限");
    const expired = setup(); expired.session.startsAt = new Date("2027-01-01T02:00:00Z"); await expect(expired.run()).rejects.toThrow("有效期限");
  });
  it("refuses another live attempt even with a fresh command", async () => { const f = setup(); await f.run(); f.receipts.length = 0; await expect(f.run({ ...reserve, requestKey: "new", expectedVersion: 1 })).rejects.toThrow("已保留"); });
});
