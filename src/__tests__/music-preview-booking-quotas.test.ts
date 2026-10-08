import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../generated/course-client";
import type { StorePlanFields } from "@/lib/store-plan";

const m = vi.hoisted(() => ({
  getStoreForPlanByStoreId: vi.fn(),
  courseTransaction: vi.fn(),
  directTransaction: vi.fn(),
}));

// Only persistence boundaries are replaced. Both public booking services use the
// real feature-gate, effective quota resolver, and reservation/settlement rules.
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: m.getStoreForPlanByStoreId }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { $transaction: m.directTransaction } }));
vi.mock("@/server/services/course-access", () => ({ courseTransaction: m.courseTransaction }));

import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { getPlanLimits } from "@/lib/feature-flags";
import { courseMonthlyBookingWhere } from "@/lib/course-usage";
import { reserveCourse, settleCourseBooking } from "@/server/services/course-booking";
import { changeOpeningMakeup, type OpeningMakeupCommand } from "@/server/services/music-opening-makeup";
import {
  musicOpeningMakeupContentHash,
  musicOpeningMakeupSourceKey,
  musicOpeningMakeupSourceSlotKey,
} from "@/lib/music-opening-makeup";
import { makeupRecord } from "./fixtures/music-opening-makeup";

const MUSIC_STORE = "store-lubymusic";
const PREVIEW_ENV = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feat/music-opening-state-20261007",
  VERCEL_GIT_REPO_OWNER: "rock7652-beep",
  VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  // Synthetic placeholders are parsed only; no database client is constructed.
  DATABASE_URL: "postgresql://postgres:synthetic-only@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
  DIRECT_URL: "postgresql://postgres:synthetic-only@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
  WORKERS_CI_BRANCH: undefined,
  CF_PAGES_BRANCH: undefined,
} as const;

type Booking = Record<string, unknown> & { id: string; status: string };

function setup(storeId = MUSIC_STORE) {
  const actor = { storeId, userId: "synthetic-manager", name: "Synthetic manager" };
  const input = {
    sessionId: "synthetic-session", cardId: "synthetic-card",
    customerId: "synthetic-student", requestKey: "synthetic-reservation",
  };
  const plan: StorePlanFields = {
    id: storeId, plan: "EXPERIENCE", planStatus: "ACTIVE",
    planEffectiveAt: null, planExpiresAt: null,
    maxStaffOverride: null, maxCustomersOverride: null, maxMonthlyBookingsOverride: null,
    maxMonthlyReportsOverride: null, maxReminderSendsOverride: null, maxStoresOverride: null,
  };
  const source = makeupRecord();
  const snapshot = makeupRecord({ scope: { ...source.scope, targetStoreId: storeId } });
  const right = {
    id: "synthetic-right", storeId, customerId: input.customerId,
    templateId: "synthetic-template", version: 0, snapshot,
    sourceKey: musicOpeningMakeupSourceKey(snapshot),
    sourceSlotKey: musicOpeningMakeupSourceSlotKey(snapshot),
    contentHash: musicOpeningMakeupContentHash(snapshot),
  };
  const session = {
    id: input.sessionId, storeId, templateId: right.templateId,
    startsAt: new Date("2026-10-09T02:00:00Z"), endsAt: new Date("2026-10-09T03:00:00Z"),
    capacity: 2, pointCost: 3, cancelledAt: null, releasedAt: null,
    teacherAttendance: "SCHEDULED",
    template: { isActive: true, visibility: "PUBLIC", classType: "PRIVATE", musicSubject: { isActive: true } },
  };
  const card = {
    id: input.cardId, storeId, unit: "SESSION", remaining: 5,
    expiresAt: new Date("2026-12-31T00:00:00Z"), members: [{ customerId: input.customerId }],
  };
  const state = { monthly: 100, occupied: 0, held: 0, duplicate: false, overlap: false };
  const bookings: Booking[] = [];
  const tx = {
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "AuditLog"')) return [];
      if (sql.includes('FROM "StoreFeatureEntitlement"')) return [{ featureKey: "business.music" }];
      if (sql.includes('FROM "Customer"')) return [{ id: input.customerId, name: "Synthetic learner" }];
      if (sql.includes("AS closed")) return [{ closed: false }];
      return [{ id: storeId }];
    }),
    $executeRaw: vi.fn(async () => 1),
    courseSession: { findFirst: vi.fn(async () => session) },
    coursePointCard: {
      findFirst: vi.fn(async () => card),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    courseBookingRule: { findUnique: vi.fn(async () => ({ bookingLeadMinutes: 0 })) },
    courseMusicOpeningMakeupEntitlement: {
      findFirst: vi.fn(async () => right),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    coursePointEntry: { create: vi.fn(), findUnique: vi.fn(async () => null) },
    courseBooking: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => bookings.filter(b => b.status !== "CANCELLED")),
      findFirst: vi.fn(async ({ where }: { where: { id?: string; session?: unknown; sessionId?: string } }) => {
        if (where.id) return bookings.find(b => b.id === where.id) ?? null;
        if (where.session) return state.overlap ? { id: "synthetic-overlap" } : null;
        return state.duplicate ? { id: "synthetic-duplicate" } : null;
      }),
      count: vi.fn(async ({ where }: { where: { createdAt?: unknown; sessionId?: string } }) =>
        where.createdAt ? state.monthly : state.occupied),
      aggregate: vi.fn(async () => ({ _sum: { pointCost: state.held } })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const booking = { id: "synthetic-booking", status: "RESERVED", ...data, session, card };
        bookings.push(booking);
        return booking;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const booking = bookings.find(b => b.id === where.id)!;
        Object.assign(booking, data);
        return booking;
      }),
    },
  };
  m.getStoreForPlanByStoreId.mockImplementation(async (requestedId: string) => {
    expect(requestedId).toBe(storeId);
    return plan;
  });
  m.courseTransaction.mockImplementation(async (requestedId: string, work: (client: typeof tx) => unknown) => {
    expect(requestedId).toBe(storeId);
    return work(tx);
  });
  m.directTransaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));
  const command: OpeningMakeupCommand = {
    entitlementId: right.id, expectedVersion: 0, requestKey: "synthetic-makeup-reservation",
    action: "RESERVE", sessionId: session.id, bookingId: null, expectedStatus: null,
    actualAttendance: false, reason: "",
  };
  return {
    actor, input, plan, session, card, state, bookings, tx,
    reserve: () => reserveCourse(actor, input),
    reserveMakeup: () => changeOpeningMakeup(actor, command),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T02:00:00Z"));
  for (const [name, value] of Object.entries(PREVIEW_ENV)) vi.stubEnv(name, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("music Preview quotas through real booking entry points", () => {
  it.each(["reserve", "reserveMakeup"] as const)("%s skips only the subscription monthly count in the exact music Preview", async method => {
    const f = setup();
    expect(getPlanLimits(f.plan).maxMonthlyBookings).toBe(100);
    expect(await getStoreLimitsByStoreId(MUSIC_STORE)).toMatchObject({ maxStaff: null, maxMonthlyBookings: null });

    await f[method]();

    expect(m.getStoreForPlanByStoreId).toHaveBeenCalledTimes(2);
    expect(f.tx.courseBooking.create).toHaveBeenCalledOnce();
    expect(f.tx.courseBooking.count).toHaveBeenCalledExactlyOnceWith({
      where: { storeId: MUSIC_STORE, sessionId: f.session.id, status: { not: "CANCELLED" } },
    });
    expect(f.tx.courseBooking.count).not.toHaveBeenCalledWith({ where: courseMonthlyBookingWhere(MUSIC_STORE) });
    if (method === "reserveMakeup") {
      expect(m.directTransaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000 });
      expect(f.bookings[0]).toMatchObject({ bookingKind: "OPENING_MAKEUP", cardId: null, pointCost: 0 });
      expect(f.tx.coursePointCard.updateMany).not.toHaveBeenCalled();
      expect(f.tx.coursePointEntry.create).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["reserve", "other store"], ["reserveMakeup", "other store"],
    ["reserve", "production main"], ["reserveMakeup", "production main"],
    ["reserve", "other Preview"], ["reserveMakeup", "other Preview"],
  ] as const)("%s still rejects the monthly cap for %s", async (method, context) => {
    const storeId = context === "other store" ? "synthetic-other-store" : MUSIC_STORE;
    if (context !== "other store") {
      vi.stubEnv("VERCEL_GIT_COMMIT_REF", context === "production main" ? "main" : "feat/synthetic-other-preview");
      vi.stubEnv("VERCEL_ENV", context === "production main" ? "production" : "preview");
    }
    const f = setup(storeId);
    expect((await getStoreLimitsByStoreId(storeId)).maxMonthlyBookings).toBe(100);

    await expect(f[method]()).rejects.toThrow("已達方案本月預約額度上限");

    expect(f.tx.courseBooking.count).toHaveBeenCalledWith({ where: courseMonthlyBookingWhere(storeId) });
    expect(f.tx.courseBooking.create).not.toHaveBeenCalled();
    expect(f.tx.coursePointEntry.create).not.toHaveBeenCalled();
    expect(f.tx.courseMusicOpeningMakeupEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it.each(["reserve", "reserveMakeup"] as const)("%s fails before a transaction when a music claim has invalid provenance", async method => {
    const f = setup();
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(f[method]()).rejects.toThrow("exact authorized Preview");
    expect(m.courseTransaction).not.toHaveBeenCalled();
    expect(m.directTransaction).not.toHaveBeenCalled();
    expect(f.tx.courseBooking.create).not.toHaveBeenCalled();
  });
});

describe("unlimited subscription bookings preserve lesson safeguards", () => {
  it.each([
    ["capacity", "本堂課已滿班"],
    ["duplicate", "此上課人已預約本堂課"],
    ["overlap", "學員同時段已有課程"],
    ["empty balance", "方案可用堂數不足"],
    ["held balance", "方案可用堂數不足"],
  ] as const)("ordinary reservations still reject %s", async (reason, message) => {
    const f = setup();
    if (reason === "capacity") f.state.occupied = f.session.capacity;
    if (reason === "duplicate") f.state.duplicate = true;
    if (reason === "overlap") f.state.overlap = true;
    if (reason === "empty balance") f.card.remaining = 0;
    if (reason === "held balance") f.state.held = f.card.remaining;

    await expect(f.reserve()).rejects.toThrow(message);

    expect(f.tx.courseBooking.create).not.toHaveBeenCalled();
    expect(f.tx.coursePointEntry.create).not.toHaveBeenCalled();
    expect(f.tx.coursePointCard.updateMany).not.toHaveBeenCalled();
  });

  it.each(["capacity", "overlap"] as const)("opening makeup still rejects %s", async reason => {
    const f = setup();
    if (reason === "capacity") f.state.occupied = f.session.capacity;
    if (reason === "overlap") f.state.overlap = true;

    await expect(f.reserveMakeup()).rejects.toThrow(reason === "capacity" ? "本堂課已滿班" : "學員同時段已有課程");

    expect(f.tx.courseBooking.create).not.toHaveBeenCalled();
    expect(f.tx.courseMusicOpeningMakeupEntitlement.updateMany).not.toHaveBeenCalled();
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("ordinary attendance still deducts exactly one lesson once after the unlimited reservation", async () => {
    const f = setup();
    await f.reserve();
    expect(f.tx.coursePointEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "RESERVE", points: 1 }) });
    expect(f.tx.coursePointCard.updateMany).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-10-09T04:00:00Z"));

    await settleCourseBooking(f.tx as unknown as Prisma.TransactionClient, f.actor, "synthetic-booking", "ATTENDED");
    await settleCourseBooking(f.tx as unknown as Prisma.TransactionClient, f.actor, "synthetic-booking", "ATTENDED");

    expect(f.tx.coursePointCard.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: f.card.id, storeId: MUSIC_STORE, remaining: { gte: 1 } },
      data: { remaining: { decrement: 1 } },
    });
    expect(f.tx.coursePointEntry.create.mock.calls.filter(([args]) => args.data.kind === "DEBIT")).toEqual([
      [{ data: { storeId: MUSIC_STORE, cardId: f.card.id, bookingId: "synthetic-booking", kind: "DEBIT", points: 1, actorUserId: f.actor.userId } }],
    ]);
    expect(f.bookings[0].status).toBe("ATTENDED");
  });

  it("attendance refuses a failed balance deduction without recording attendance or debit", async () => {
    const f = setup();
    await f.reserve();
    f.tx.coursePointEntry.create.mockClear();
    f.tx.coursePointCard.updateMany.mockResolvedValue({ count: 0 });
    vi.setSystemTime(new Date("2026-10-09T04:00:00Z"));

    await expect(settleCourseBooking(f.tx as unknown as Prisma.TransactionClient, f.actor, "synthetic-booking", "ATTENDED"))
      .rejects.toThrow("方案額度異常，尚未完成點名");

    expect(f.tx.courseBooking.update).not.toHaveBeenCalled();
    expect(f.tx.coursePointEntry.create).not.toHaveBeenCalled();
    expect(f.bookings[0].status).toBe("RESERVED");
  });
});
