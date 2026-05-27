/**
 * backfill-store-presentation.ts (PR-E)
 *
 * 一次性 backfill 竹北店的 per-store presentation 欄位，值取自
 * src/lib/liff/messages.ts 的「曾經寫死的全域常數」。
 *
 * 為什麼需要：PR-E 把 Store.liffId / ShopConfig.address / ShopConfig.mapUrl
 * 改為 per-store 欄位；resolveStorePresentation 缺值 fallback 到常數所以不會
 * 空白，但「實際 DB 值」與「常數值」應該一致，避免之後改常數時竹北顯示突變。
 *
 * 安全特性：
 *   - 預設 dry-run（不傳 --apply 不寫）
 *   - Idempotent：只在欄位是 null 時才寫入；重跑只會印「nothing to do」
 *   - 只動 slug=zhubei 一店；其他店即使 missing 也不碰
 *   - DB 連線從 process.env.DATABASE_URL 讀，不接 CLI 參數
 *
 * Usage:
 *   # Dry-run（預設）— 印出 plan，不寫 DB
 *   npx tsx scripts/backfill-store-presentation.ts
 *
 *   # 確認是要動的 DB 後（看 host / database 確認），加 --apply 實際寫入
 *   npx tsx scripts/backfill-store-presentation.ts --apply
 *
 * 部署順序：
 *   1. prisma migrate deploy 跑完（Store.liffId / ShopConfig.address / mapUrl 已存在）
 *   2. 先跑 dry-run 看 plan
 *   3. 確認 plan 後 --apply
 *   4. 重跑 dry-run 驗證 idempotent（所有欄位應該變 false = 已 backfilled）
 */

import { PrismaClient } from "@prisma/client";

const DRY_RUN = !process.argv.includes("--apply");

// 竹北店現值（取自 src/lib/liff/messages.ts；逐欄核對過）
const ZHUBEI_VALUES = {
  // Store.liffId — 從 env 讀，因為原本 env 對照表就是 source of truth
  liffId: process.env.NEXT_PUBLIC_LIFF_ID_ZHUBEI ?? null,
  // ShopConfig.lineOfficialUrl — 既有欄位，prod 可能已有值；只在 null 時寫
  lineOfficialUrl: "https://line.me/R/ti/p/@083vmikb",
  // ShopConfig.address — PR-E 新增；複製自 messages.ts storeAddress
  address: "302新竹縣竹北市中崙里科大一路80號",
  // ShopConfig.mapUrl — PR-E 新增；複製自 messages.ts storeMapUrl
  mapUrl: "https://maps.app.goo.gl/EyqUvkAaHCxu6iWz5?g_st=ic",
} as const;

const prisma = new PrismaClient();

function describeDatabaseUrl(): { host: string; database: string } | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      host: u.hostname || "(no host)",
      database: u.pathname.replace(/^\//, "") || "(no database)",
    };
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const dbInfo = describeDatabaseUrl();
  console.log("─".repeat(60));
  console.log("PR-E backfill: per-store presentation (zhubei only)");
  console.log(`mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY (will write DB)"}`);
  if (dbInfo) {
    console.log(`db:   ${dbInfo.host} / ${dbInfo.database}`);
  } else {
    console.log("db:   (DATABASE_URL not set or unparseable)");
  }
  console.log("─".repeat(60));

  // 1. 找竹北 store
  const store = await prisma.store.findUnique({
    where: { slug: "zhubei" },
    select: {
      id: true,
      slug: true,
      name: true,
      liffId: true,
      shopConfig: {
        select: {
          id: true,
          lineOfficialUrl: true,
          address: true,
          mapUrl: true,
        },
      },
    },
  });

  if (!store) {
    console.error("[ERROR] zhubei store not found. Aborting.");
    return 1;
  }

  // 2. 計算 plan
  const plan = {
    storeLiffId:
      store.liffId == null && ZHUBEI_VALUES.liffId != null
        ? ZHUBEI_VALUES.liffId
        : null,
    shopConfigCreate: store.shopConfig == null,
    shopLineOfficial:
      store.shopConfig?.lineOfficialUrl == null
        ? ZHUBEI_VALUES.lineOfficialUrl
        : null,
    shopAddress:
      store.shopConfig?.address == null ? ZHUBEI_VALUES.address : null,
    shopMapUrl: store.shopConfig?.mapUrl == null ? ZHUBEI_VALUES.mapUrl : null,
  };

  console.log("\nCurrent zhubei values:");
  console.table([
    {
      field: "Store.liffId",
      current: store.liffId ?? "(null)",
      willWrite: plan.storeLiffId ?? "(skip)",
    },
    {
      field: "ShopConfig (row)",
      current: store.shopConfig ? "exists" : "(missing)",
      willWrite: plan.shopConfigCreate ? "CREATE" : "(skip)",
    },
    {
      field: "ShopConfig.lineOfficialUrl",
      current: store.shopConfig?.lineOfficialUrl ?? "(null)",
      willWrite: plan.shopLineOfficial ?? "(skip)",
    },
    {
      field: "ShopConfig.address",
      current: store.shopConfig?.address ?? "(null)",
      willWrite: plan.shopAddress ?? "(skip)",
    },
    {
      field: "ShopConfig.mapUrl",
      current: store.shopConfig?.mapUrl ?? "(null)",
      willWrite: plan.shopMapUrl ?? "(skip)",
    },
  ]);

  const willDoAnything =
    plan.storeLiffId !== null ||
    plan.shopConfigCreate ||
    plan.shopLineOfficial !== null ||
    plan.shopAddress !== null ||
    plan.shopMapUrl !== null;

  if (!willDoAnything) {
    console.log("\n[ok] nothing to do — already backfilled (idempotent).");
    return 0;
  }

  if (
    store.liffId == null &&
    ZHUBEI_VALUES.liffId == null
  ) {
    console.warn(
      "[warn] Store.liffId is null AND NEXT_PUBLIC_LIFF_ID_ZHUBEI env not set. " +
        "skipping liffId backfill; LIFF will fall back to 'NotOpenForLiff' UI."
    );
  }

  if (DRY_RUN) {
    console.log(
      "\n[dry-run] no writes performed. Re-run with --apply to commit."
    );
    return 0;
  }

  // 3. Apply
  console.log("\n[apply] writing changes...");
  await prisma.$transaction(async (tx) => {
    // Store.liffId
    if (plan.storeLiffId !== null) {
      await tx.store.update({
        where: { id: store.id },
        data: { liffId: plan.storeLiffId },
      });
      console.log(`  + Store.liffId = ${plan.storeLiffId}`);
    }

    // ShopConfig — upsert（既有 row 走 update；不存在則 create）
    if (
      plan.shopConfigCreate ||
      plan.shopLineOfficial !== null ||
      plan.shopAddress !== null ||
      plan.shopMapUrl !== null
    ) {
      await tx.shopConfig.upsert({
        where: { storeId: store.id },
        create: {
          storeId: store.id,
          // shopName 用 default "蒸足"，不在此 backfill 範圍
          lineOfficialUrl:
            plan.shopLineOfficial ?? ZHUBEI_VALUES.lineOfficialUrl,
          address: plan.shopAddress ?? ZHUBEI_VALUES.address,
          mapUrl: plan.shopMapUrl ?? ZHUBEI_VALUES.mapUrl,
        },
        update: {
          ...(plan.shopLineOfficial !== null && {
            lineOfficialUrl: plan.shopLineOfficial,
          }),
          ...(plan.shopAddress !== null && { address: plan.shopAddress }),
          ...(plan.shopMapUrl !== null && { mapUrl: plan.shopMapUrl }),
        },
      });
      console.log(
        `  + ShopConfig ${plan.shopConfigCreate ? "created" : "updated"}`
      );
    }
  });

  console.log("\n[ok] backfill complete. Re-run without --apply to verify idempotent.");
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error("[FATAL]", err);
    process.exit(2);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
