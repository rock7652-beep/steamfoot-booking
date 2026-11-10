import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ cards: vi.fn(), adjustments: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { coursePointCard: { findMany: m.cards } } }));
vi.mock("@/server/services/course-session-adjustment-records", () => ({ courseSessionAdjustmentRecords: m.adjustments }));
import { readCoursePhonePlanGrids } from "@/server/queries/course-phone-plan-grids";
beforeEach(() => { vi.resetAllMocks(); m.cards.mockResolvedValue([{ id: "card", entries: [{ points: 8 }], bookings: [{ id: "attended", pointCost: 1, session: { startsAt: new Date("2026-11-03T03:00:00Z") } }] }]); m.adjustments.mockResolvedValue([]); });
it("derives eight immutable purchased cells, selects only this store's learner and excludes reservations", async () => {
  expect((await readCoursePhonePlanGrids("store", "child-a", ["card"])).get("card")).toEqual({ total: 8, dates: ["2026-11-03T03:00:00.000Z"] });
  const input = m.cards.mock.calls[0][0];
  expect(input.where).toMatchObject({ storeId: "store", id: { in: ["card"] }, members: { some: { storeId: "store", customerId: "child-a" } }, musicOpeningStateRequired: false });
  expect(input.select.bookings.where).toMatchObject({ storeId: "store", customerId: "child-a", status: "ATTENDED", absenceKind: null, session: { cancelledAt: null } });
});
it("includes dated backfills but excludes reversals, voids and another learner's records", async () => {
  const base = { cardId: "card", customerId: "child-a", operation: "BACKFILL", occurredOn: "2026-11-02", quantity: 1, reversalOf: null };
  m.adjustments.mockResolvedValue([{ ...base, id: "valid" }, { ...base, id: "reversed" }, { ...base, id: "reverse", operation: "REVERSE", reversalOf: "reversed" }, { ...base, id: "other", customerId: "child-b" }, { ...base, id: "void", operation: "VOID" }]);
  const result = (await readCoursePhonePlanGrids("store", "child-a", ["card"])).get("card")!;
  expect(result.total).toBe(8); expect(result.dates).toHaveLength(2); expect(result.dates[0]).toBe("2026-11-01T16:00:00.000Z");
});
it("does not invent purchased quantities or silently truncate inconsistent history", async () => {
  m.cards.mockResolvedValue([{ id: "missing", entries: [], bookings: [] }, { id: "overflow", entries: [{ points: 1 }], bookings: [{ pointCost: 2, session: { startsAt: new Date() } }] }]);
  expect((await readCoursePhonePlanGrids("store", "child-a", ["missing", "overflow"])).size).toBe(0);
});
