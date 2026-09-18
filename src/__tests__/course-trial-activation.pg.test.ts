import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { openSingleStoreTrialInTransaction } from "@/server/services/single-store-trial";
import { toLocalDateStr } from "@/lib/date-utils";

// CI creates the schema in an explicit loopback-only disposable *_test database.
const url = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
const storeId = "course-trial-activation-" + randomUUID();
let created = false;
(url ? describe : describe.skip)("course delivery trial activation — real PostgreSQL", () => {
  afterAll(async () => {
    if (db && created) {
      await db.store.update({ where: { id: storeId }, data: { currentSubscriptionId: null } });
      await db.storePlanChange.deleteMany({ where: { storeId } });
      await db.storeSubscription.deleteMany({ where: { storeId } });
      await db.storeModuleInstallation.deleteMany({ where: { storeId } });
      await db.store.delete({ where: { id: storeId } });
    }
    await db?.$disconnect();
  });
  it("serializes two acceptance requests into one 30-day subscription and refuses replay without extending it", async () => {
    if (!db) throw new Error("Explicit loopback test DB required");
    await db.store.create({ data: { id: storeId, slug: storeId, name: "Isolated delivery concurrency", industryModule: "COURSE", plan: "EXPERIENCE", planStatus: "TRIAL", liffId: "2010-pg", moduleInstallation: { create: { module: "COURSE", status: "ACTIVE" } } } });
    created = true;
    const input = { storeId, actorId: "isolated-test-hq", startDate: toLocalDateStr(), entryAcceptanceConfirmed: true };
    const open = () => db.$transaction(tx => openSingleStoreTrialInTransaction(tx, input), { timeout: 15000 });
    const results = await Promise.allSettled([open(), open()]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const before = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    expect(await db.storeSubscription.count({ where: { storeId } })).toBe(1);
    expect(await db.storePlanChange.count({ where: { storeId, changeType: "TRIAL_STARTED" } })).toBe(1);
    expect(before.planExpiresAt!.getTime() - before.planEffectiveAt!.getTime()).toBe(29 * 86400000);
    await expect(open()).rejects.toThrow("不可重新起算");
    const after = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    expect(after.currentSubscriptionId).toBe(before.currentSubscriptionId);
    expect(after.planEffectiveAt).toEqual(before.planEffectiveAt);
    expect(after.planExpiresAt).toEqual(before.planExpiresAt);
  }, 30000);
});
