/**
 * Production script: 更新竹北店（default-store）為正式營運設定
 * 執行方式: npx tsx prisma/update-zhubei-store.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Updating 竹北店 (default-store) ...");

  const store = await prisma.store.update({
    where: { id: "default-store" },
    data: {
      name: "暖暖蒸足",
      slug: "zhubei",
      plan: "GROWTH",
      planStatus: "ACTIVE",
      domain: "steamfoot-zhubei.com",
    },
  });

  console.log("  Store updated:", store.name, "plan=", store.plan);

  const config = await prisma.shopConfig.upsert({
    where: { storeId: "default-store" },
    create: { storeId: "default-store", shopName: "暖暖蒸足", plan: "PRO" },
    update: { shopName: "暖暖蒸足", plan: "PRO" },
  });

  console.log("  ShopConfig updated: shopName=", config.shopName, "plan=", config.plan);
  console.log("\nDone! 竹北店設定完成。");
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
