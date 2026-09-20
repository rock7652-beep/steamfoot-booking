import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { addTaiwanDuration, parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { getTrialRetention } from "@/lib/trial-retention";

vi.mock("@/lib/session", () => ({ requireStaffSession: async () => ({ id: "retention-test-hq", role: "ADMIN" }) }));
vi.mock("@/lib/permissions", () => ({ requirePermission: async () => undefined }));
vi.mock("@/lib/revalidation", () => ({ revalidateStorePlan: () => undefined, revalidateShopConfig: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { resolveBookingConcurrencyTestDatabaseUrl: resolve } = await import("./helpers/booking-concurrency-test-db");
  const url = resolve(process.env);
  return { prisma: url ? new PrismaClient({ datasourceUrl: url }) : null };
});
import { prisma } from "@/lib/db";
import { upsertStoreSubscription } from "@/server/actions/store-subscription";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";

const url = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const stores: string[] = [];
(url ? describe : describe.skip)("retention with real PostgreSQL and HQ subscription action", () => {
  afterAll(async () => {
    if (!prisma) return;
    for (const id of stores) {
      await prisma.store.update({ where: { id }, data: { currentSubscriptionId: null } });
      await prisma.storePlanChange.deleteMany({ where: { storeId: id } });
      await prisma.storeSubscription.deleteMany({ where: { storeId: id } });
      await prisma.customer.deleteMany({ where: { storeId: id } });
      await prisma.store.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it.each(["BASIC", "GROWTH", "ALLIANCE"])("preserves customer and identity when day-30 trial upgrades to %s", async plan => {
    const today = toLocalDateStr();
    const end = parseTaiwanDateToDbDate(addTaiwanDuration(today, -30, "DAY"));
    const start = parseTaiwanDateToDbDate(addTaiwanDuration(today, -59, "DAY"));
    const id = `retention-${randomUUID()}`;
    await prisma.store.create({ data: { id, slug: id, name: "Disposable retention fixture", industryModule: "COURSE", plan: "EXPERIENCE", planStatus: "EXPIRED", planEffectiveAt: start, planExpiresAt: end } });
    stores.push(id);
    const subscription = await prisma.storeSubscription.create({ data: { storeId: id, plan: "EXPERIENCE", status: "EXPIRED", isTrial: true, startedAt: start, expiresAt: end } });
    await prisma.store.update({ where: { id }, data: { currentSubscriptionId: subscription.id } });
    const customer = await prisma.customer.create({ data: { storeId: id, name: "Synthetic retained customer", phone: id, notes: "must survive conversion" } });
    const before = await prisma.store.findUniqueOrThrow({ where: { id } });
    expect(getTrialRetention(before)?.state).toBe("RETAINED");
    await expect(assertStoreSubscriptionWritable(id)).rejects.toThrow("唯讀");
    // A disposable fixture exercises day 31 without changing clocks or any existing store.
    const day31 = parseTaiwanDateToDbDate(addTaiwanDuration(today, -31, "DAY"));
    await prisma.storeSubscription.update({ where: { id: subscription.id }, data: { expiresAt: day31 } });
    await prisma.store.update({ where: { id }, data: { planExpiresAt: day31 } });
    expect(getTrialRetention(await prisma.store.findUniqueOrThrow({ where: { id } }))?.state).toBe("PENDING_CLEANUP");
    await expect(assertStoreSubscriptionWritable(id)).rejects.toThrow("唯讀");
    await prisma.storeSubscription.update({ where: { id: subscription.id }, data: { expiresAt: end } });
    await prisma.store.update({ where: { id }, data: { planExpiresAt: end } });
    const result = await upsertStoreSubscription({ storeId: id, subscriptionId: subscription.id, plan, status: "ACTIVE", billingCycle: "MONTHLY", startedAt: today, expiresAt: addTaiwanDuration(today, 29, "DAY"), billingStatus: "WAIVED", priceAmount: 0 });
    expect(result).toMatchObject({ success: true });
    const after = await prisma.store.findUniqueOrThrow({ where: { id } });
    expect(after.currentSubscriptionId).toBe(before.currentSubscriptionId);
    expect(after.slug).toBe(before.slug);
    expect(after.plan).toBe(plan);
    expect(getTrialRetention(after)).toBeNull();
    await expect(assertStoreSubscriptionWritable(id)).resolves.toBeUndefined();
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toEqual(customer);
    expect(await prisma.storePlanChange.count({ where: { storeId: id, changeType: "PLAN_ACTIVATED" } })).toBe(1);
  }, 30000);
});
