/**
 * backfill-store-presentation.ts (PR-E)
 *
 * 一次性 backfill **單一店** 的 per-store presentation 欄位。
 *
 * 預設 target：`zhubei`（production 主要目的）— 寫入 src/lib/liff/messages.ts
 * 的歷史全域常數值，讓 DB 值與既有 fallback 完全一致。
 *
 * 為什麼需要：PR-E 把 Store.liffId / ShopConfig.address / ShopConfig.mapUrl
 * 改為 per-store 欄位；resolveStorePresentation 缺值 fallback 到常數所以不會
 * 空白，但「實際 DB 值」與「常數值」應該一致，避免之後改常數時竹北顯示突變。
 *
 * 安全特性：
 *   - 預設 dry-run（不傳 --apply 不寫）
 *   - Idempotent：只在欄位是 null 時才寫入；重跑只會印「nothing to do」
 *   - **單一 target slug per run**（預設 zhubei；其他 slug 需明確指定）
 *   - DB 連線從 process.env.DATABASE_URL 讀，不接 CLI 參數
 *   - 非 zhubei slug 寫入**明確標示為 staging test 的佔位值**，避免污染真實資料
 *
 * Usage（PRODUCTION：預設 zhubei，不需任何 flag）：
 *   # Dry-run（預設）— 印出 plan，不寫 DB
 *   npx tsx scripts/backfill-store-presentation.ts
 *
 *   # 確認是要動的 DB 後（看 host / database 確認），加 --apply 實際寫入
 *   npx tsx scripts/backfill-store-presentation.ts --apply
 *
 * Usage（STAGING：指定 non-zhubei slug，例如 staging seed 的 'staging'）：
 *   # 方式 A：CLI flag
 *   npx tsx scripts/backfill-store-presentation.ts --slug=staging
 *   npx tsx scripts/backfill-store-presentation.ts --slug=staging --apply
 *
 *   # 方式 B：env var（如果 wrapper script 用 env 設）
 *   BACKFILL_STORE_SLUG=staging npx tsx scripts/backfill-store-presentation.ts
 *
 * 非 zhubei slug 寫入的值：
 *   liffId          ← process.env.NEXT_PUBLIC_LIFF_ID_<SLUG_UPPER>（無則 null）
 *   lineOfficialUrl ← `https://line.me/R/ti/p/staging-<slug>`（假 URL，明確 test）
 *   address         ← `[staging seed test] address for <slug>`（明確 test 文字）
 *   mapUrl          ← `https://maps.app.goo.gl/staging-<slug>`（假 URL，明確 test）
 *
 * 部署順序：
 *   1. prisma migrate deploy 跑完
 *   2. 先跑 dry-run 看 plan（確認 target slug 印的是預期值）
 *   3. 確認 plan 後 --apply
 *   4. 重跑 dry-run 驗證 idempotent（所有欄位應該變 false = 已 backfilled）
 */

import { PrismaClient } from "@prisma/client";

const DRY_RUN = !process.argv.includes("--apply");

// ─── Target slug 解析 ──────────────────────────────────────
// 優先序：CLI --slug=<name> > env BACKFILL_STORE_SLUG > 預設 "zhubei"
function resolveTargetSlug(): string {
  const cliArg = process.argv.find((a) => a.startsWith("--slug="));
  if (cliArg) {
    const v = cliArg.slice("--slug=".length).trim();
    if (v) return v;
  }
  const envVal = process.env.BACKFILL_STORE_SLUG?.trim();
  if (envVal) return envVal;
  return "zhubei";
}

const TARGET_SLUG = resolveTargetSlug();

// ─── 各 slug 對應的寫入值 ──────────────────────────────────
type PresentationValues = {
  liffId: string | null;
  lineOfficialUrl: string;
  address: string;
  mapUrl: string;
};

// 竹北 production 值（取自 src/lib/liff/messages.ts；逐欄核對過）
const ZHUBEI_VALUES: PresentationValues = {
  // Store.liffId — 從 env 讀，因為原本 env 對照表就是 source of truth
  liffId: process.env.NEXT_PUBLIC_LIFF_ID_ZHUBEI ?? null,
  // ShopConfig.lineOfficialUrl — 既有欄位，prod 可能已有值；只在 null 時寫
  lineOfficialUrl: "https://line.me/R/ti/p/@083vmikb",
  // ShopConfig.address — PR-E 新增；複製自 messages.ts storeAddress
  address: "302新竹縣竹北市中崙里科大一路80號",
  // ShopConfig.mapUrl — PR-E 新增；複製自 messages.ts storeMapUrl
  mapUrl: "https://maps.app.goo.gl/EyqUvkAaHCxu6iWz5?g_st=ic",
} as const;

/**
 * 非 zhubei target（staging seed 等）的寫入值。
 *
 * 用「明確標示為 staging test」的 placeholder：假 URL + bracket 文字。
 * 這樣即使誤跑到 prod，DB 也只會出現「明顯不是真實資料」的字串——
 * staff 一眼看出來、不會誤導顧客。
 *
 * LIFF ID 走 env 對照表慣例（同 src/lib/liff/liff-id.ts）：讀
 * NEXT_PUBLIC_LIFF_ID_<SLUG_UPPER>，未設則 null（page 顯示 NotOpenForLiff）。
 */
function valuesForTestSlug(slug: string): PresentationValues {
  return {
    liffId:
      process.env[`NEXT_PUBLIC_LIFF_ID_${slug.toUpperCase()}`] ?? null,
    lineOfficialUrl: `https://line.me/R/ti/p/staging-${slug}`,
    address: `[staging seed test] address for ${slug}`,
    mapUrl: `https://maps.app.goo.gl/staging-${slug}`,
  };
}

const TARGET_VALUES: PresentationValues =
  TARGET_SLUG === "zhubei" ? ZHUBEI_VALUES : valuesForTestSlug(TARGET_SLUG);

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
  const slugSource =
    process.argv.find((a) => a.startsWith("--slug=")) != null
      ? "CLI --slug"
      : process.env.BACKFILL_STORE_SLUG
        ? "env BACKFILL_STORE_SLUG"
        : "default";
  const slugBadge =
    TARGET_SLUG === "zhubei"
      ? "(PRODUCTION default)"
      : "(test slug — placeholder values will be written)";

  console.log("─".repeat(60));
  console.log("PR-E backfill: per-store presentation");
  console.log(`mode:        ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY (will write DB)"}`);
  console.log(`target slug: ${TARGET_SLUG} ${slugBadge}`);
  console.log(`slug source: ${slugSource}`);
  if (dbInfo) {
    console.log(`db:          ${dbInfo.host} / ${dbInfo.database}`);
  } else {
    console.log("db:          (DATABASE_URL not set or unparseable)");
  }
  console.log("─".repeat(60));

  // 1. 找 target store
  const store = await prisma.store.findUnique({
    where: { slug: TARGET_SLUG },
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
    console.error(`[ERROR] store '${TARGET_SLUG}' not found. Aborting.`);
    return 1;
  }

  // 2. 計算 plan
  const plan = {
    storeLiffId:
      store.liffId == null && TARGET_VALUES.liffId != null
        ? TARGET_VALUES.liffId
        : null,
    shopConfigCreate: store.shopConfig == null,
    shopLineOfficial:
      store.shopConfig?.lineOfficialUrl == null
        ? TARGET_VALUES.lineOfficialUrl
        : null,
    shopAddress:
      store.shopConfig?.address == null ? TARGET_VALUES.address : null,
    shopMapUrl: store.shopConfig?.mapUrl == null ? TARGET_VALUES.mapUrl : null,
  };

  console.log(`\nCurrent values for slug '${TARGET_SLUG}':`);
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

  if (store.liffId == null && TARGET_VALUES.liffId == null) {
    const envName = `NEXT_PUBLIC_LIFF_ID_${TARGET_SLUG.toUpperCase()}`;
    console.warn(
      `[warn] Store.liffId is null AND ${envName} env not set. ` +
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
  console.log(`\n[apply] writing changes to slug '${TARGET_SLUG}'...`);
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
            plan.shopLineOfficial ?? TARGET_VALUES.lineOfficialUrl,
          address: plan.shopAddress ?? TARGET_VALUES.address,
          mapUrl: plan.shopMapUrl ?? TARGET_VALUES.mapUrl,
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
