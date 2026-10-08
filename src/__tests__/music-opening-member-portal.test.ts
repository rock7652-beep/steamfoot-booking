import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  account: vi.fn(), identity: vi.fn(), staffLink: vi.fn(), store: vi.fn(), config: vi.fn(),
  context: vi.fn(), hours: vi.fn(), special: vi.fn(), feature: vi.fn(), contact: vi.fn(),
  income: vi.fn(), musicFeature: vi.fn(), cards: vi.fn(), sharedCardState: vi.fn(),
  sessions: vi.fn(), bookings: vi.fn(), nextBooking: vi.fn(), nextWork: vi.fn(),
  plans: vi.fn(), orders: vi.fn(), templates: vi.fn(), bookingRule: vi.fn(),
  health: vi.fn(), healthCount: vi.fn(), coaches: vi.fn(), referral: vi.fn(), write: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/server/services/course-access", () => ({ courseAccount: m.account }));
vi.mock("@/server/services/frontend-preview", () => ({
  authorizeFrontendPreview: vi.fn(), resolveCoursePreviewIdentity: vi.fn(),
}));
vi.mock("@/server/services/course-shared-card", () => ({ getCourseSharedCardState: m.sharedCardState }));
vi.mock("@/server/queries/course-members", () => ({ getCourseCards: m.cards }));
vi.mock("@/server/queries/referral-share-context", () => ({ getReferralShareContext: m.referral }));
vi.mock("@/server/services/course-personal-income", () => ({ personalIncomeAccess: m.income }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: m.context }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.feature }));
vi.mock("@/lib/native-health-service", () => ({ getNativeHealthSummary: vi.fn() }));
vi.mock("@/lib/shop-config", () => ({
  resolveCustomerBookingWindow: () => ({ closesAt: new Date("2026-11-01T00:00:00Z") }),
}));
vi.mock("@/app/(customer)/book/course-portal-client", () => ({ CoursePortalClient: () => null }));
vi.mock("@/lib/db", () => ({ prisma: {
  staffMemberLink: { findUnique: m.identity, findFirst: m.staffLink },
  store: { findUniqueOrThrow: m.store }, shopConfig: { findUnique: m.config },
  businessHours: { findMany: m.hours }, specialBusinessDay: { findMany: m.special },
  customer: { findFirst: m.contact }, storeFeatureEntitlement: { findFirst: m.musicFeature },
  customerHealthRecord: { findMany: m.health, count: m.healthCount }, staff: { findMany: m.coaches },
} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {
  courseSession: { findMany: m.sessions, findFirst: m.nextWork },
  courseBooking: { findMany: m.bookings, findFirst: m.nextBooking, create: m.write, update: m.write, delete: m.write },
  coursePointPlan: { findMany: m.plans }, coursePurchase: { findMany: m.orders },
  courseTemplate: { findMany: m.templates }, courseBookingRule: { findUnique: m.bookingRule },
  musicOpeningMakeupEntitlement: { create: m.write, update: m.write },
  coursePointCard: { update: m.write }, coursePointLedger: { create: m.write }, $transaction: m.write,
} }));

import { loadCoursePortal } from "@/app/(customer)/book/course-portal";
import { monthRange } from "@/lib/date-utils";

const storeId = "synthetic-portal-store";
const customerId = "synthetic-portal-member";
const sharedCardId = "synthetic-shared-card";
const now = new Date("2026-10-08T00:00:00Z");

type BookingRow = {
  id: string;
  storeId: string;
  bookingKind: string;
  customerId: string | null;
  customerName: string;
  operatorName: string;
  reserverCustomerId: string | null;
  sessionId: string;
  status: string;
  cardId: string | null;
  card: { nameSnapshot: string; unit: string; expiresAt: Date } | null;
  pointCost: number;
  makeupForBookingId: string | null;
  musicOpeningMakeupEntitlementId: string | null;
  musicOpeningMakeupEntitlement: {
    id: string; storeId: string; customerId: string; sourceKey: string; contentHash: string;
  } | null;
  musicOpeningSourceLessonKey: string | null;
  createdAt: Date;
  trialPayments: { amount: number }[];
  trialPrice: number | null;
  session: {
    nameSnapshot: string; startsAt: Date; coachId: string; cancelledAt: Date | null;
    room: { name: string };
  };
};

// All fixtures are synthetic. The persistence mock applies the loader's actual
// predicates rather than supplying a canned, already-authorized booking list.
function openingBooking(id = "own-opening", patch: Partial<BookingRow> = {}): BookingRow {
  return {
    id, storeId, customerId, customerName: "合成會員", operatorName: "合成店員",
    bookingKind: "OPENING_MAKEUP", reserverCustomerId: null,
    sessionId: "synthetic-session", status: "RESERVED", cardId: null, card: null,
    pointCost: 0, makeupForBookingId: null,
    musicOpeningMakeupEntitlementId: "private-entitlement-id",
    musicOpeningMakeupEntitlement: {
      id: "private-entitlement-id", storeId, customerId,
      sourceKey: "private-source-key", contentHash: "private-content-hash",
    },
    musicOpeningSourceLessonKey: "private-source-lesson-key",
    createdAt: new Date("2026-10-07T00:00:00Z"), trialPayments: [], trialPrice: null,
    session: {
      nameSnapshot: "合成音樂課", startsAt: new Date("2026-10-10T02:00:00Z"),
      coachId: "synthetic-coach", cancelledAt: null, room: { name: "合成教室" },
    },
    ...patch,
  };
}

function nativeBooking(id: string, patch: Partial<BookingRow> = {}): BookingRow {
  return openingBooking(id, {
    bookingKind: "CARD", cardId: sharedCardId, pointCost: 1,
    card: { nameSnapshot: "原生堂數方案", unit: "SESSION", expiresAt: new Date("2026-12-31T15:59:59Z") },
    musicOpeningMakeupEntitlementId: null, musicOpeningMakeupEntitlement: null,
    musicOpeningSourceLessonKey: null, ...patch,
  });
}

type Where = Record<string, unknown>;
type BookingQuery = { where: Where; orderBy?: unknown; select?: Record<string, boolean> };
let rows: BookingRow[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function matches(value: unknown, condition: unknown): boolean {
  if (!isRecord(condition)) return Object.is(value, condition);
  return Object.entries(condition).every(([key, expected]) => {
    if (key === "OR") return Array.isArray(expected) && expected.some(item => matches(value, item));
    if (key === "AND") return (Array.isArray(expected) ? expected : [expected]).every(item => matches(value, item));
    if (key === "NOT") return !(Array.isArray(expected) ? expected : [expected]).some(item => matches(value, item));
    if (key === "in") return Array.isArray(expected) && expected.includes(value);
    if (key === "not") return !matches(value, expected);
    if (key === "is") return value !== null && value !== undefined && matches(value, expected);
    if (key === "gte" || key === "lte") {
      if (!(value instanceof Date) || !(expected instanceof Date)) throw new Error(`Unsupported date predicate: ${key}`);
      return key === "gte" ? value >= expected : value <= expected;
    }
    return isRecord(value) && matches(value[key], expected);
  });
}

function readBookings(query: BookingQuery) {
  const result = rows.filter(row => matches(row, query.where));
  result.sort((a, b) => isRecord(query.orderBy) && "session" in query.orderBy
    ? a.session.startsAt.getTime() - b.session.startsAt.getTime()
    : a.createdAt.getTime() - b.createdAt.getTime());
  return result;
}

function bookingQueries() {
  expect(m.bookings).toHaveBeenCalledTimes(2);
  expect(m.nextBooking).toHaveBeenCalledTimes(1);
  return [m.bookings.mock.calls[0][0], m.nextBooking.mock.calls[0][0], m.bookings.mock.calls[1][0]] as BookingQuery[];
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  rows = [openingBooking()];
  m.account.mockResolvedValue({ user: { id: "synthetic-user" }, storeId, customer: { id: customerId, name: "合成會員" } });
  m.identity.mockResolvedValue({ courseMemberEnabled: true });
  m.staffLink.mockResolvedValue(null);
  m.store.mockResolvedValue({ name: "合成音樂店", slug: "synthetic-portal" });
  m.config.mockResolvedValue(null);
  m.context.mockResolvedValue({ storeSlug: "synthetic-portal" });
  m.hours.mockResolvedValue([]);
  m.special.mockResolvedValue([]);
  m.feature.mockResolvedValue(false);
  m.contact.mockResolvedValue(null);
  m.income.mockResolvedValue(null);
  m.musicFeature.mockResolvedValue({ storeId });
  m.cards.mockResolvedValue([]);
  m.sharedCardState.mockResolvedValue("ENABLED");
  m.sessions.mockResolvedValue([]);
  m.nextWork.mockResolvedValue(null);
  m.plans.mockResolvedValue([]);
  m.orders.mockResolvedValue([]);
  m.templates.mockResolvedValue([]);
  m.health.mockResolvedValue([]);
  m.healthCount.mockResolvedValue(0);
  m.bookingRule.mockResolvedValue({ cancellationLeadMinutes: 120, selfBookingEnabled: true });
  m.coaches.mockResolvedValue([{ id: "synthetic-coach", displayName: "合成老師" }]);
  m.referral.mockResolvedValue(null);
  m.bookings.mockImplementation(async (query: BookingQuery) => {
    const result = readBookings(query);
    return query.select
      ? result.map(row => Object.fromEntries(Object.entries(query.select!).filter(([, selected]) => selected).map(([key]) => [key, row[key as keyof BookingRow]])))
      : result;
  });
  m.nextBooking.mockImplementation(async (query: BookingQuery) => readBookings(query)[0] ?? null);
  m.write.mockImplementation(() => { throw new Error("The member portal must remain read-only"); });
});

afterEach(() => vi.useRealTimers());

describe("member portal opening-makeup visibility", () => {
  it("returns an own independent reservation without a card or reserver link and hides source identifiers", async () => {
    const result = await loadCoursePortal("2026-10");

    expect(m.cards).toHaveBeenCalledWith(storeId, customerId);
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]).toMatchObject({
      id: "own-opening", customerId, openingMakeup: true, cost: 0, unit: "SESSION",
      planName: "期初補課（獨立權益，請由店家處理）", trialPaid: null, trialPrice: null,
    });
    expect(result.nextBooking).toMatchObject({
      name: "合成音樂課", openingMakeup: true, coach: "合成老師",
      participants: [{ id: "own-opening", name: "合成會員" }],
    });
    expect(JSON.stringify(result)).not.toMatch(/private-entitlement-id|private-source-key|private-content-hash|private-source-lesson-key|musicOpeningMakeupEntitlement|musicOpeningSourceLessonKey|sourceKey|contentHash/);
    expect(m.write).not.toHaveBeenCalled();
  });

  it("uses the same scoped native and opening access predicate for month, next booking, and next participants", async () => {
    m.cards.mockResolvedValue([{ id: sharedCardId, unit: "SESSION", members: [], expiresAt: null }]);
    await loadCoursePortal("2026-10");

    const expectedAccess = [
      {
        bookingKind: { not: "OPENING_MAKEUP" }, musicOpeningMakeupEntitlementId: null,
        OR: [
          { cardId: { in: [sharedCardId] } },
          { bookingKind: "TRIAL", customerId },
          { reserverCustomerId: customerId },
        ],
      },
      {
        bookingKind: "OPENING_MAKEUP", customerId, cardId: null, pointCost: 0,
        makeupForBookingId: null, musicOpeningMakeupEntitlement: { is: { storeId, customerId } },
      },
    ];
    const [month, next, participants] = bookingQueries();
    for (const query of [month, next, participants]) {
      expect(query.where.storeId).toBe(storeId);
      expect(query.where.OR).toEqual(expectedAccess);
    }
    const range = monthRange("2026-10");
    expect(month.where.session).toEqual({ startsAt: { gte: range.start, lte: range.end } });
    expect(next.where).toMatchObject({ status: "RESERVED", session: { cancelledAt: null, startsAt: { gte: now } } });
    expect(participants.where).toMatchObject({ sessionId: "synthetic-session", status: "RESERVED" });
    expect(participants.select).toEqual({ id: true, customerId: true, customerName: true });
  });

  it.each([
    ["another booking customer", { customerId: "other-member" }],
    ["another booking store", { storeId: "other-store" }],
    ["another entitlement customer", { musicOpeningMakeupEntitlement: { ...openingBooking().musicOpeningMakeupEntitlement!, customerId: "other-member" } }],
    ["another entitlement store", { musicOpeningMakeupEntitlement: { ...openingBooking().musicOpeningMakeupEntitlement!, storeId: "other-store" } }],
    ["missing entitlement", { musicOpeningMakeupEntitlementId: null, musicOpeningMakeupEntitlement: null }],
    ["dangling entitlement", { musicOpeningMakeupEntitlement: null }],
    ["unexpected card", { cardId: sharedCardId }],
    ["unexpected point charge", { pointCost: 1 }],
    ["native makeup source", { makeupForBookingId: "native-source" }],
  ] satisfies [string, Partial<BookingRow>][])("excludes %s from all three member reads", async (_label, patch) => {
    // The invalid row comes first, and its reserver belongs to the viewer. It
    // must not leak through the old native/reserver branch or become next.
    rows = [openingBooking("invalid-opening", { reserverCustomerId: customerId, ...patch }), openingBooking()];
    const result = await loadCoursePortal("2026-10");

    expect(result.bookings.map(row => row.id)).toEqual(["own-opening"]);
    expect(result.nextBooking?.participants).toEqual([{ id: "own-opening", name: "合成會員" }]);
    expect(result.nextBooking?.openingMakeup).toBe(true);
    for (const query of bookingQueries()) expect(readBookings(query).map(row => row.id)).toEqual(["own-opening"]);
  });

  it("preserves native shared-card, own trial, and reserver visibility without admitting hybrid opening rows", async () => {
    m.musicFeature.mockResolvedValue(null);
    m.cards.mockResolvedValue([{ id: sharedCardId, unit: "POINT", members: [], expiresAt: null }]);
    rows = [
      nativeBooking("shared-family", { customerId: "family-member", customerName: "合成家人" }),
      nativeBooking("own-trial", { bookingKind: "TRIAL", cardId: null, card: null, pointCost: 0, trialPrice: 500, trialPayments: [{ amount: 500 }] }),
      nativeBooking("own-companion", { customerId: null, customerName: "合成同行者", cardId: null, card: null, reserverCustomerId: customerId }),
      nativeBooking("unrelated-native", { customerId: "other-member", cardId: "other-card" }),
      nativeBooking("hybrid-card", { musicOpeningMakeupEntitlementId: "private-entitlement-id" }),
      nativeBooking("hybrid-trial", { bookingKind: "TRIAL", cardId: null, card: null, musicOpeningMakeupEntitlementId: "private-entitlement-id" }),
      nativeBooking("hybrid-reserver", { customerId: null, cardId: null, card: null, reserverCustomerId: customerId, musicOpeningMakeupEntitlementId: "private-entitlement-id" }),
      nativeBooking("opening-via-shared-card", { bookingKind: "OPENING_MAKEUP" }),
      nativeBooking("native-other-store", { storeId: "other-store" }),
    ];
    const result = await loadCoursePortal("2026-10");
    const expectedIds = ["shared-family", "own-trial", "own-companion"];

    expect(result.bookings.map(row => row.id)).toEqual(expectedIds);
    expect(result.bookings.every(row => row.openingMakeup === false)).toBe(true);
    expect(result.bookings[1]).toMatchObject({ unit: "TRIAL", trialPrice: 500, trialPaid: 500, planName: "體驗（不使用方案）" });
    expect(result.nextBooking?.openingMakeup).toBe(false);
    expect(result.nextBooking?.participants.map(row => row.id)).toEqual(expectedIds);
    for (const query of bookingQueries()) expect(readBookings(query).map(row => row.id)).toEqual(expectedIds);
  });

  it("keeps monthly history while the next appointment remains a future reserved, uncancelled session", async () => {
    const pastSession = { ...openingBooking().session, startsAt: new Date("2026-10-05T02:00:00Z") };
    rows = [
      openingBooking("past-opening", { sessionId: "past-session", session: pastSession }),
      openingBooking("cancelled-opening", { status: "CANCELLED" }),
      openingBooking("cancelled-session", { sessionId: "cancelled-session", session: { ...openingBooking().session, cancelledAt: now } }),
      openingBooking(),
    ];
    const result = await loadCoursePortal("2026-10");

    expect(result.bookings).toHaveLength(4);
    expect(result.nextBooking?.participants).toEqual([{ id: "own-opening", name: "合成會員" }]);
    expect(readBookings(m.nextBooking.mock.calls[0][0]).map(row => row.id)).toEqual(["own-opening"]);
  });

  it("skips member-only persistence reads when membership is disabled", async () => {
    m.identity.mockResolvedValue({ courseMemberEnabled: false });
    const result = await loadCoursePortal("2026-10");

    expect(result).toMatchObject({ memberEnabled: false, bookings: [], cards: [], sessions: [], plans: [], orders: [], nextBooking: null });
    for (const read of [m.cards, m.sessions, m.bookings, m.nextBooking, m.plans, m.orders, m.bookingRule, m.health, m.healthCount, m.referral]) {
      expect(read).not.toHaveBeenCalled();
    }
    expect(m.write).not.toHaveBeenCalled();
  });

  it("still returns own appointments read-only when member self-booking is disabled", async () => {
    m.bookingRule.mockResolvedValue({ cancellationLeadMinutes: 120, selfBookingEnabled: false });
    const before = structuredClone(rows);
    const result = await loadCoursePortal("2026-10");

    expect(result.selfBookingEnabled).toBe(false);
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]).toMatchObject({ id: "own-opening", openingMakeup: true });
    expect(result.nextBooking?.participants).toEqual([{ id: "own-opening", name: "合成會員" }]);
    expect(bookingQueries()).toHaveLength(3);
    expect(rows).toEqual(before);
    expect(m.write).not.toHaveBeenCalled();
  });
});
