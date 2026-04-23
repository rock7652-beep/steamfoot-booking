/**
 * backfill-referral-code.ts — 冪等腳本：為舊會員補上 referralCode
 *
 * Usage:
 *   npx tsx scripts/backfill-referral-code.ts            # dry-run（只印統計）
 *   npx tsx scripts/backfill-referral-code.ts --execute  # 實際寫入
 *
 * 行為：
 *   - 只掃 referralCode IS NULL 的 Customer，逐筆生成唯一 6 碼
 *   - 生成時碰撞 → 重試（最多 8 次），極小機率失敗直接印 warning 略過
 *   - 完全不碰 sponsorId、不回推推薦關係、不改任何其他欄位
 *   - 可重複執行：只會處理尚未補碼的顧客
 *
 * 前置條件：
 *   - prisma/migrations/20260423_referral_points_system 已 deploy
 *     （即 Customer.referralCode 欄位 + uq_customer_referral_code 唯一索引已建立）
 *   - 若 migration 尚未 deploy，此腳本會因 column 不存在而失敗 — 安全 fail-fast
 */

import { PrismaClient } from "@prisma/client";
import { generateReferralCode } from "../src/lib/referral-code";

const prisma = new PrismaClient();

const DRY_RUN = !process.argv.includes("--execute");
const BATCH_SIZE = 500;
const MAX_COLLISION_RETRIES = 8;

async function generateUniqueCode(
  existing: Set<string>,
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    const code = generateReferralCode();
    if (existing.has(code)) continue;
    // 查 DB 確認沒被其他 customer 搶走（批次執行時仍可能碰撞）
    const collision = await prisma.customer.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!collision) {
      existing.add(code);
      return code;
    }
    existing.add(code); // 把已知存在的 code 也記下，下一輪避開
  }
  return null;
}

async function main() {
  console.log(
    `\n=== Backfill Customer.referralCode (${DRY_RUN ? "DRY-RUN" : "EXECUTE"}) ===\n`,
  );

  // 先盤點：多少顧客還沒 code、總共多少顧客
  const [pending, total, alreadyFilled] = await Promise.all([
    prisma.customer.count({ where: { referralCode: null } }),
    prisma.customer.count(),
    prisma.customer.count({ where: { referralCode: { not: null } } }),
  ]);

  console.log(`Total customers:          ${total}`);
  console.log(`Already have referralCode: ${alreadyFilled}`);
  console.log(`Pending backfill:         ${pending}\n`);

  if (pending === 0) {
    console.log("Nothing to backfill. Exiting.");
    return;
  }

  if (DRY_RUN) {
    console.log("Dry-run mode. No writes will be performed.");
    console.log("Re-run with --execute to apply.\n");
    return;
  }

  // 把目前已占用的 code 先載入 memory，減少 DB 查詢
  const existingCodes = new Set<string>();
  const existingRows = await prisma.customer.findMany({
    where: { referralCode: { not: null } },
    select: { referralCode: true },
  });
  for (const row of existingRows) {
    if (row.referralCode) existingCodes.add(row.referralCode);
  }

  let cursor: string | undefined;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  while (true) {
    const batch = await prisma.customer.findMany({
      where: { referralCode: null },
      select: { id: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (batch.length === 0) break;

    for (const cust of batch) {
      processed += 1;
      const code = await generateUniqueCode(existingCodes);
      if (!code) {
        console.warn(
          `[WARN] Could not generate unique code for customer ${cust.id} after ${MAX_COLLISION_RETRIES} retries. Skipping.`,
        );
        failed += 1;
        continue;
      }

      try {
        await prisma.customer.update({
          where: { id: cust.id },
          data: { referralCode: code },
        });
        succeeded += 1;
      } catch (err) {
        // P2002 極少數情況下：同時有另個進程搶走了這個 code
        const code2002 = (err as { code?: string })?.code === "P2002";
        if (code2002) {
          // 把剛剛占用的從 memory cache 移除，並重試一次
          existingCodes.delete(code);
          const retry = await generateUniqueCode(existingCodes);
          if (retry) {
            try {
              await prisma.customer.update({
                where: { id: cust.id },
                data: { referralCode: retry },
              });
              succeeded += 1;
              continue;
            } catch {
              /* fall through to failed */
            }
          }
        }
        console.warn(`[WARN] Update failed for ${cust.id}:`, err);
        failed += 1;
      }
    }

    cursor = batch[batch.length - 1]?.id;

    if (processed % 1000 === 0) {
      console.log(`  ... processed ${processed} (ok=${succeeded} fail=${failed})`);
    }
  }

  console.log(
    `\nDone. processed=${processed} succeeded=${succeeded} failed=${failed}\n`,
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
