import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), joins: vi.fn(), cards: vi.fn(), rule: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {
  courseSession: { findFirst: m.session, findMany: m.joins },
  coursePointCard: { findMany: m.cards },
} }));
vi.mock("@/server/services/sports-staging-schedule", () => ({ readSportsSessionRule: m.rule }));
vi.mock("@/server/services/sports-teaching-templates", () => ({ readSportsTeachingTemplates: async () => ["old-A", "new-A"] }));
vi.mock("@/server/services/music-item-compatibility", () => ({ musicItemTemplateIds: async () => ["old-A", "new-A"] }));
import { readCourseApplicableBalances } from "@/server/services/course-applicable-balances";

const card = (id: string, remaining: number, held = 0) => ({
  id, storeId: "store", nameSnapshot: id, unit: "SESSION", remaining, closedAt: null,
  planId: id, requestKey: id, templateIds: ["old-A"], termSessionIds: [],
  sportsMode: "ASSIGNED", sportsSubjectId: "A", sportsCost: 1,
  expiresAt: new Date("2027-12-01"), musicValidityDays: null, musicActivatedAt: null,
  musicJoinSessionId: null, musicOpeningStateRequired: false, musicOpeningState: null,
  members: [{ customerId: "ming" }], plan: { chargeSettings: null },
  bookings: held ? [{ pointCost: held, session: { startsAt: new Date("2026-11-04") } }] : [],
});
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z")); vi.clearAllMocks();
  m.session.mockResolvedValue({ id: "lesson", templateId: "new-A", coachId: "coach", pointCost: 1,
    startsAt: new Date("2026-11-04"), template: { musicSubjectId: "A" } });
  m.rule.mockResolvedValue({ enrollment: "ASSIGNED", planId: null });
  m.joins.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
it.each([false, true])("aggregates all valid A cards for music=%s", async music => {
  m.cards.mockResolvedValue([card("old", 1, 1), card("renewal", 20)]);
  const result = await readCourseApplicableBalances("store", "lesson", ["ming", "ming"], music);
  expect(result.get("ming")?.groups).toEqual([{ unit: "SESSION", remaining: 21, held: 1, available: 20 }]);
  expect(m.cards).toHaveBeenCalledTimes(1);
  expect(m.cards.mock.calls[0][0].where).toMatchObject({ storeId: "store", closedAt: null, members: { some: { customerId: { in: ["ming"] } } } });
});
it.each([false, true])("excludes expired, wrong-item, restricted-term and makeup cards for music=%s", async music => {
  m.cards.mockResolvedValue([
    card("valid", 20),
    { ...card("expired", 99), expiresAt: new Date("2026-11-01") },
    { ...card("wrong", 99), sportsSubjectId: "B", templateIds: ["B"] },
    { ...card("term", 99), termSessionIds: ["other"] },
    { ...card("coupon", 99), requestKey: "music-leave-makeup:source" },
    { ...card("unknown", 99), expiresAt: null },
    { ...card("damaged", 99), musicOpeningStateRequired: true },
  ]);
  expect((await readCourseApplicableBalances("store", "lesson", ["ming"], music)).get("ming")?.groups[0].available).toBe(20);
});
it("does not include a music purchase before its join date", async () => {
  m.cards.mockResolvedValue([{ ...card("later", 20), musicJoinSessionId: "join" }]);
  m.joins.mockResolvedValue([{ id: "join", startsAt: new Date("2026-11-10") }]);
  expect((await readCourseApplicableBalances("store", "lesson", ["ming"], true)).get("ming")?.cards).toEqual([]);
});
it("does not multiply shared balances or return another member's identity", async () => {
  m.cards.mockResolvedValue([{ ...card("shared", 20, 2), members: [{ customerId: "ming" }, { customerId: "other" }] }]);
  const result = await readCourseApplicableBalances("store", "lesson", ["ming"], false);
  expect(result.size).toBe(1);
  expect(result.get("ming")?.cards).toMatchObject([{ shared: true, available: 18 }]);
  expect(JSON.stringify(result.get("ming"))).not.toContain("other");
});
