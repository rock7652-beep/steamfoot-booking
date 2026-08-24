import { prisma } from "../src/lib/db";

const FEATURE = "ai_health_summary";
const TARGET_SLUG = "zhubei";
const CONTROLLED_SLUGS = ["zhubei", "hsinchu", "taichung"] as const;
const execute = process.argv.includes("--execute");
const confirmation = process.argv.includes("--confirm-warmwarm-pilot");

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
      where: { source: "HEALTHFLOW" },
      select: { storeId: true, customerId: true, sourceRecordId: true, customer: { select: { storeId: true } } },
    }),
  ]);

  if (records.length !== 431) throw new Error(`正式 HEALTHFLOW 紀錄應為 431 筆，實際 ${records.length} 筆，停止`);
  if (records.some((record) => !record.sourceRecordId)) throw new Error("存在缺少來源 ID 的 HEALTHFLOW 紀錄，停止");
  if (new Set(records.map((record) => record.sourceRecordId)).size !== 431) throw new Error("HEALTHFLOW 來源 ID 不唯一，停止");
  const crossStore = records.filter((record) => record.storeId !== record.customer.storeId);
  if (crossStore.length > 0) throw new Error(`發現 ${crossStore.length} 筆跨店健康紀錄，停止`);

  const counts = Object.fromEntries(stores.map((store) => {
    const entitlement = entitlements.find((item) => item.storeId === store.id) ?? null;
    return [store.slug, {
      records: records.filter((record) => record.storeId === store.id).length,
      customers: new Set(records.filter((record) => record.storeId === store.id).map((record) => record.customerId)).size,
      entitlement: entitlement ? {
        status: entitlement.status,
        source: entitlement.source,
        startsAt: entitlement.startsAt,
        expiresAt: entitlement.expiresAt,
      } : null,
    }];
  }));

  return { stores, counts, totalRecords: records.length, crossStore: crossStore.length };
}

function publicReport(snapshotValue: Awaited<ReturnType<typeof snapshot>>) {
  return {
    totalRecords: snapshotValue.totalRecords,
    crossStore: snapshotValue.crossStore,
    stores: Object.fromEntries(snapshotValue.stores.map((store) => [
      store.slug,
      {
        name: store.name,
        plan: store.plan,
        operatingStatus: store.operatingStatus,
        ...snapshotValue.counts[store.slug],
      },
    ])),
  };
}

async function main() {
  const before = await snapshot();
  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", before: publicReport(before) }, null, 2));
  if (!execute) return;
  if (!confirmation) throw new Error("缺少 --confirm-warmwarm-pilot，停止");

  const bySlug = new Map(before.stores.map((store) => [store.slug, store]));
  await prisma.$transaction(async (tx) => {
    for (const slug of CONTROLLED_SLUGS) {
      const store = bySlug.get(slug);
      if (!store) throw new Error(`找不到 ${slug}`);
      const status = slug === TARGET_SLUG ? "ENABLED" : "DISABLED";
      await tx.storeFeatureEntitlement.upsert({
        where: { uq_store_feature_entitlement: { storeId: store.id, featureKey: FEATURE } },
        create: {
          storeId: store.id,
          featureKey: FEATURE,
          status,
          source: "HQ_OVERRIDE",
          note: slug === TARGET_SLUG ? "2026-08-24 原生健康功能單店小範圍驗收" : "2026-08-24 原生健康功能分店維持關閉",
        },
        update: {
          status,
          source: "HQ_OVERRIDE",
          startsAt: null,
          expiresAt: null,
          note: slug === TARGET_SLUG ? "2026-08-24 原生健康功能單店小範圍驗收" : "2026-08-24 原生健康功能分店維持關閉",
          updatedBy: null,
        },
      });
    }
  });

  const after = await snapshot();
  for (const slug of CONTROLLED_SLUGS) {
    const entitlement = after.counts[slug]?.entitlement;
    const expected = slug === TARGET_SLUG ? "ENABLED" : "DISABLED";
    if (!entitlement || entitlement.status !== expected || entitlement.source !== "HQ_OVERRIDE") throw new Error(`${slug} 開關驗證失敗`);
  }
  console.log(JSON.stringify({ result: "verified", after: publicReport(after) }, null, 2));
}

main().catch((error) => {
  console.error("[native-health-pilot]", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
