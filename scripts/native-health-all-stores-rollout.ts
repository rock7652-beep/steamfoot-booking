import { prisma } from "../src/lib/db";

const FEATURE = "ai_health_summary";
const CONTROLLED_SLUGS = ["zhubei", "hsinchu", "taichung"] as const;
const EXPECTED_HEALTHFLOW_RECORDS = 431;
const execute = process.argv.includes("--execute");
const confirmation = process.argv.includes("--confirm-all-stores");

async function snapshot() {
  const stores = await prisma.store.findMany({
    where: { slug: { in: [...CONTROLLED_SLUGS] } },
    select: { id: true, slug: true, name: true, plan: true, operatingStatus: true },
    orderBy: { slug: "asc" },
  });
  if (stores.length !== CONTROLLED_SLUGS.length) {
    throw new Error(`預期 3 家正式店，實際找到 ${stores.length} 家，停止`);
  }
  for (const slug of CONTROLLED_SLUGS) {
    if (!stores.some((store) => store.slug === slug)) throw new Error(`缺少正式店 ${slug}，停止`);
  }

  const storeIds = stores.map((store) => store.id);
  const [entitlements, records] = await Promise.all([
    prisma.storeFeatureEntitlement.findMany({
      where: { storeId: { in: storeIds }, featureKey: FEATURE },
      select: { storeId: true, status: true, source: true, startsAt: true, expiresAt: true },
    }),
    prisma.customerHealthRecord.findMany({
      select: {
        id: true,
        storeId: true,
        customerId: true,
        source: true,
        sourceRecordId: true,
        customer: { select: { storeId: true } },
      },
      orderBy: { id: "asc" },
    }),
  ]);

  const healthflowRecords = records.filter((record) => record.source === "HEALTHFLOW");
  if (healthflowRecords.length !== EXPECTED_HEALTHFLOW_RECORDS) {
    throw new Error(
      `正式 HEALTHFLOW 紀錄應為 ${EXPECTED_HEALTHFLOW_RECORDS} 筆，實際 ${healthflowRecords.length} 筆，停止`,
    );
  }
  if (healthflowRecords.some((record) => !record.sourceRecordId)) {
    throw new Error("存在缺少來源 ID 的 HEALTHFLOW 紀錄，停止");
  }
  if (new Set(healthflowRecords.map((record) => record.sourceRecordId)).size !== EXPECTED_HEALTHFLOW_RECORDS) {
    throw new Error("HEALTHFLOW 來源 ID 不唯一，停止");
  }
  const crossStore = records.filter((record) => record.storeId !== record.customer.storeId);
  if (crossStore.length > 0) throw new Error(`發現 ${crossStore.length} 筆跨店健康紀錄，停止`);

  const counts = Object.fromEntries(
    stores.map((store) => {
      const entitlement = entitlements.find((item) => item.storeId === store.id) ?? null;
      const storeRecords = records.filter((record) => record.storeId === store.id);
      return [
        store.slug,
        {
          records: storeRecords.length,
          healthflowRecords: storeRecords.filter((record) => record.source === "HEALTHFLOW").length,
          nativeRecords: storeRecords.filter((record) => record.source === "STEAMFOOT").length,
          customers: new Set(storeRecords.map((record) => record.customerId)).size,
          entitlement: entitlement
            ? {
                status: entitlement.status,
                source: entitlement.source,
                startsAt: entitlement.startsAt,
                expiresAt: entitlement.expiresAt,
              }
            : null,
        },
      ];
    }),
  );

  return {
    stores,
    counts,
    recordIds: records.map((record) => record.id),
    totalRecords: records.length,
    healthflowRecords: healthflowRecords.length,
    crossStore: crossStore.length,
  };
}

function publicReport(snapshotValue: Awaited<ReturnType<typeof snapshot>>) {
  return {
    totalRecords: snapshotValue.totalRecords,
    healthflowRecords: snapshotValue.healthflowRecords,
    crossStore: snapshotValue.crossStore,
    stores: Object.fromEntries(
      snapshotValue.stores.map((store) => [
        store.slug,
        {
          name: store.name,
          plan: store.plan,
          operatingStatus: store.operatingStatus,
          ...snapshotValue.counts[store.slug],
        },
      ]),
    ),
  };
}

async function main() {
  const before = await snapshot();
  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", before: publicReport(before) }, null, 2));
  if (!execute) return;
  if (!confirmation) throw new Error("缺少 --confirm-all-stores，停止");

  const bySlug = new Map(before.stores.map((store) => [store.slug, store]));
  await prisma.$transaction(async (tx) => {
    for (const slug of CONTROLLED_SLUGS) {
      const store = bySlug.get(slug);
      if (!store) throw new Error(`找不到 ${slug}`);
      await tx.storeFeatureEntitlement.upsert({
        where: { uq_store_feature_entitlement: { storeId: store.id, featureKey: FEATURE } },
        create: {
          storeId: store.id,
          featureKey: FEATURE,
          status: "ENABLED",
          source: "HQ_OVERRIDE",
          note: "2026-08-25 原生健康功能三店正式開放",
        },
        update: {
          status: "ENABLED",
          source: "HQ_OVERRIDE",
          startsAt: null,
          expiresAt: null,
          note: "2026-08-25 原生健康功能三店正式開放",
          updatedBy: null,
        },
      });
    }
  });

  const after = await snapshot();
  for (const slug of CONTROLLED_SLUGS) {
    const entitlement = after.counts[slug]?.entitlement;
    if (!entitlement || entitlement.status !== "ENABLED" || entitlement.source !== "HQ_OVERRIDE") {
      throw new Error(`${slug} 開關驗證失敗`);
    }
  }
  if (JSON.stringify(after.recordIds) !== JSON.stringify(before.recordIds)) {
    throw new Error("開關更新前後健康紀錄集合不一致，停止");
  }
  console.log(JSON.stringify({ result: "verified", after: publicReport(after) }, null, 2));
}

main()
  .catch((error) => {
    console.error("[native-health-all-stores-rollout]", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
