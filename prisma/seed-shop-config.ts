/**
 * 初始化 ShopConfig — 正式營運用
 *
 * 用法：npx tsx prisma/seed-shop-config.ts
 * 冪等操作：已存在則不覆蓋
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.shopConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      shopName: "蒸足",
      plan: "BASIC",
    },
    update: {}, // 已存在則保留現有值
  });

  console.log("ShopConfig:", result);
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
