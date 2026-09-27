import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";

const push = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { resolveBookingConcurrencyTestDatabaseUrl: resolve } = await import("./helpers/booking-concurrency-test-db");
  const url = resolve(process.env);
  return { prisma: url ? new PrismaClient({ datasourceUrl: url }) : null };
});
vi.mock("@/lib/line", () => ({ pushMessage: push, pushSteamButlerMessage: push }));
vi.mock("@/server/services/manager-notification-delivery", () => ({ deliverManagerNotification: vi.fn() }));
vi.mock("@/server/services/central-line-recipient-loader", () => ({ resolveCentralLineRecipientForCustomer: vi.fn() }));
vi.mock("@/server/services/verified-reminder-line-route", () => ({
  resolveVerifiedReminderLineRoute: async () => ({ status: "READY", channel: "STORE", recipientLineUserId: "synthetic-recipient" }),
}));
vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://example.test" }));

import { prisma } from "@/lib/db";
import { dispatchSessionBalanceNotifications, retrySessionBalanceNotifications } from "@/server/services/session-balance-notifications";

const url = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const storeId = `delivery-test-${randomUUID()}`;
let customerId: string;
let planId: string;

async function notification(extra: Record<string, unknown> = {}) {
  const wallet = await prisma.customerPlanWallet.create({ data: {
    customerId, storeId, planId, purchasedPrice: 100, totalSessions: 1,
    remainingSessions: 0, status: "USED_UP", startDate: new Date("2026-09-01"),
  } });
  return prisma.sessionBalanceNotification.create({ data: {
    customerId, storeId, walletId: wallet.id, type: "PLAN_USED_UP",
    deliveryVersion: 1, nextAttemptAt: new Date(0),
    retryUntil: new Date(Date.now() + 3_600_000), ...extra,
  } });
}

(url ? describe : describe.skip)("session delivery on disposable PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.store.create({ data: { id: storeId, slug: storeId, name: "Synthetic delivery test" } });
    customerId = (await prisma.customer.create({ data: { storeId, name: "Synthetic customer", phone: storeId } })).id;
    planId = (await prisma.servicePlan.create({ data: { storeId, name: "Synthetic plan", category: "PACKAGE", price: 100, sessionCount: 1 } })).id;
  });
  beforeEach(async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    push.mockReset(); push.mockResolvedValue({ success: true });
    await prisma.sessionBalanceNotification.deleteMany({ where: { storeId } });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.sessionBalanceNotification.deleteMany({ where: { storeId } });
    await prisma.customerPlanWallet.deleteMany({ where: { storeId } });
    await prisma.servicePlan.deleteMany({ where: { storeId } });
    await prisma.customer.deleteMany({ where: { storeId } });
    await prisma.store.delete({ where: { id: storeId } });
    await prisma.$disconnect();
  });

  it("actual additive migration preserves legacy rows and defaults", async () => {
    const sql = readFileSync("prisma/migrations/20260927154000_session_balance_delivery/migration.sql", "utf8");
    await prisma.$transaction(async (tx) => {
      // Temp schema shadows only this transaction's table; permanent fixtures are untouched.
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "SessionBalanceNotification" (id TEXT PRIMARY KEY, status TEXT) ON COMMIT DROP');
      await tx.$executeRawUnsafe('INSERT INTO "SessionBalanceNotification" VALUES (\'legacy\', \'PENDING\')');
      for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRaw<Array<{ deliveryVersion: number; deliveryAttempts: number; deliverySnapshot: unknown }>>`
        SELECT "deliveryVersion", "deliveryAttempts", "deliverySnapshot" FROM "SessionBalanceNotification" WHERE id = 'legacy'`;
      expect(rows).toEqual([{ deliveryVersion: 0, deliveryAttempts: 0, deliverySnapshot: null }]);
    });
  });

  it("concurrent dispatchers acquire one lease and send once", async () => {
    const n = await notification();
    await Promise.all([dispatchSessionBalanceNotifications([n.id]), dispatchSessionBalanceNotifications([n.id])]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(await prisma.sessionBalanceNotification.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ status: "SENT", deliveryAttempts: 1, leaseUntil: null });
  });

  it("failed delivery retries the identical key and frozen content", async () => {
    const n = await notification();
    push.mockResolvedValueOnce({ success: false, error: "synthetic failure" });
    await dispatchSessionBalanceNotifications([n.id]);
    const original = push.mock.calls[0];
    await prisma.sessionBalanceNotification.update({ where: { id: n.id }, data: { nextAttemptAt: new Date(0) } });
    await retrySessionBalanceNotifications();
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[1]).toEqual(original);
    expect(await prisma.sessionBalanceNotification.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ status: "SENT", deliveryAttempts: 2 });
  });

  it("recovers a worker interrupted after a saved snapshot", async () => {
    const n = await notification({ deliveryAttempts: 1, leaseUntil: new Date(0), deliverySnapshot: {
      channel: "STORE", recipient: "synthetic-recipient", body: "saved", messages: [{ type: "text", text: "saved" }],
    } });
    await retrySessionBalanceNotifications();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][2]).toEqual([{ type: "text", text: "saved" }]);
    expect(await prisma.sessionBalanceNotification.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ status: "SENT", deliveryAttempts: 2 });
  });

  it("does not take an active worker lease", async () => {
    await notification({ deliveryAttempts: 1, leaseUntil: new Date(Date.now() + 60_000) });
    await retrySessionBalanceNotifications();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not replay legacy, expired, or exhausted records", async () => {
    await notification({ deliveryVersion: 0 });
    const expired = await notification({ retryUntil: new Date(0) });
    const exhausted = await notification({ deliveryAttempts: 5 });
    await retrySessionBalanceNotifications();
    expect(push).not.toHaveBeenCalled();
    expect(await prisma.sessionBalanceNotification.count({ where: { id: { in: [expired.id, exhausted.id] }, status: "FAILED" } })).toBe(2);
  });

  it("stale worker cannot overwrite a newer worker result", async () => {
    const n = await notification();
    push.mockImplementationOnce(async () => {
      await prisma.sessionBalanceNotification.update({ where: { id: n.id }, data: {
        status: "SENT", leaseUntil: null, errorMessage: "new worker result",
      } });
      return { success: false, error: "stale worker failure" };
    });
    await dispatchSessionBalanceNotifications([n.id]);
    expect(await prisma.sessionBalanceNotification.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ status: "SENT", errorMessage: "new worker result" });
  });

  it("blocks preview dispatch without claiming or sending", async () => {
    const n = await notification();
    vi.stubEnv("VERCEL_ENV", "preview");
    await dispatchSessionBalanceNotifications([n.id]);
    expect(push).not.toHaveBeenCalled();
    expect(await prisma.sessionBalanceNotification.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ status: "PENDING", deliveryAttempts: 0 });
  });
});
