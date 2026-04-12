/**
 * Backfill v2 Plan System
 *
 * 為每個現有 Store 建立初始 StoreSubscription + StorePlanChange，
 * 並設定 Store.planStatus + currentSubscriptionId。
 *
 * 執行：npx tsx prisma/backfill-v2-plan.ts
 * 冪等：已有 currentSubscriptionId 的 store 會被跳過。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.store.findMany({
    select: { id: true, name: true, plan: true, currentSubscriptionId: true, createdAt: true },
  });

  let created = 0;
  let skipped = 0;

  for (const store of stores) {
    // 冪等：跳過已 backfill 的
    if (store.currentSubscriptionId) {
      console.log(`  SKIP: ${store.name} (already has subscription)`);
      skipped++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // 1. 建初始 StoreSubscription
      const sub = await tx.storeSubscription.create({
        data: {
          storeId: store.id,
          plan: store.plan,
          status: "ACTIVE",
          startedAt: store.createdAt,
          billingStatus: "NOT_REQUIRED",
          note: "Backfill: v2 初始訂閱",
        },
      });

      // 2. 建初始 StorePlanChange
      await tx.storePlanChange.create({
        data: {
          storeId: store.id,
          changeType: "PLAN_ACTIVATED",
          toPlan: store.plan,
          toStatus: "ACTIVE",
          subscriptionId: sub.id,
          reason: "Backfill: v2 方案系統初始化",
        },
      });

      // 3. 更新 Store
      await tx.store.update({
        where: { id: store.id },
        data: {
          planStatus: "ACTIVE",
          currentSubscriptionId: sub.id,
        },
      });
    });

    console.log(`  OK: ${store.name} → ${store.plan}`);
    created++;
  }

  console.log(`\nBackfill 完成: ${created} created, ${skipped} skipped (total: ${stores.length})`);
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
