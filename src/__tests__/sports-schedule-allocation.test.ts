import { beforeEach, it, expect, vi } from "vitest";
import type { Prisma } from "../../generated/course-client";
const m = vi.hoisted(() => ({
  reserve: vi.fn(),
  cards: vi.fn(),
  card: vi.fn(),
  execute: vi.fn(),
  sessions: vi.fn(),
}));
vi.mock("@/lib/sports-staging", () => ({
  requireSportsStaging: vi.fn(),
  sportsStagingEnabled: () => true,
}));
vi.mock("@/lib/feature-gate", () => ({
  getStoreLimitsByStoreId: async () => ({ maxMonthlyBookings: null }),
}));
vi.mock("@/server/services/course-booking", () => ({
  reserveCourseInTransaction: m.reserve,
}));
import { attachSportsSessionRules } from "@/server/services/sports-staging-schedule";
import { addTaiwanDuration, parseTaipeiDateTime } from "@/lib/date-utils";
const actor = { storeId: "store", userId: "owner", name: "Owner" };
const sessions = Array.from({ length: 8 }, (_, i) => ({
  id: `s${i}`,
  requestIndex: i,
  templateId: "template",
  startsAt: parseTaipeiDateTime(
    addTaiwanDuration("2099-01-01", i * 7, "DAY"),
    "20:00",
  )!,
  pointCost: 1,
  isTrial: false,
}));
const tx = {
  $executeRaw: m.execute,
  courseSession: { findMany: m.sessions },
  coursePointPlan: {
    findFirst: async () => ({ id: "plan", templateIds: ["template"] }),
  },
  coursePointCard: { findMany: m.cards, findFirst: m.card },
} as unknown as Prisma.TransactionClient;
const rule = {
  frequency: "WEEKLY" as const,
  enrollment: "ASSIGNED" as const,
  planId: "plan",
  students: [{ customerId: "member", cardId: null as string | null }],
  trialPrice: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.sessions.mockResolvedValue(sessions);
  m.cards.mockResolvedValue([
    {
      id: "used",
      unit: "SESSION",
      remaining: 10,
      bookings: [{ pointCost: 3 }],
    },
    { id: "available", unit: "SESSION", remaining: 10, bookings: [] },
  ]);
  m.card.mockResolvedValue({ id: "available", planId: "plan" });
  m.reserve.mockResolvedValue({ id: "booking" });
});
it("allocates one sufficient card for the full batch while preserving automatic intent", async () => {
  await attachSportsSessionRules(tx, actor, "request", rule);
  expect(m.cards).toHaveBeenCalledTimes(1);
  expect(m.reserve).toHaveBeenCalledTimes(8);
  for (const call of m.reserve.mock.calls)
    expect(call[2].cardId).toBe("available");
  expect(m.cards.mock.calls[0][0].where).toMatchObject({
    storeId: "store",
    planId: "plan",
    expiresAt: { gte: sessions[7].startsAt },
    members: { some: { customerId: "member" } },
  });
  for (const call of m.execute.mock.calls)
    expect(JSON.parse(call.at(-1)).students[0].cardId).toBe(null);
  expect(rule.students[0].cardId).toBe(null);
});
it("keeps an explicit existing card selection without reallocating it", async () => {
  await attachSportsSessionRules(tx, actor, "request", {
    ...rule,
    students: [{ customerId: "member", cardId: "original" }],
  });
  expect(m.cards).not.toHaveBeenCalled();
  expect(m.reserve.mock.calls[0][2].cardId).toBe("original");
});
it("rejects a batch with no sufficient card before creating any reservation", async () => {
  m.cards.mockResolvedValue([
    {
      id: "held",
      unit: "SESSION",
      remaining: 10,
      bookings: [{ pointCost: 8 }],
    },
  ]);
  await expect(
    attachSportsSessionRules(tx, actor, "request", rule),
  ).rejects.toThrow("額度");
  expect(m.reserve).not.toHaveBeenCalled();
});
