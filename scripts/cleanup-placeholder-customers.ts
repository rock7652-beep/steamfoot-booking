/**
 * 清理 OAuth 佔位 Customer
 *
 * 目標：
 *   - phone 以 "_oauth_" 開頭（auth.ts signIn 時建的佔位）
 *   - 且 userId 為 null（已被 merge transaction 釋放）
 *   - 且 無任何 booking / referralEvent 關聯（純佔位無實際使用紀錄）
 *
 * 執行方式：
 *   - DRY_RUN=1 tsx scripts/cleanup-placeholder-customers.ts  # 只列出不刪
 *   - tsx scripts/cleanup-placeholder-customers.ts             # 實際刪除
 *
 * 安全規則：
 *   - 只刪 phone="_oauth_*" 的 Customer，絕不刪真實使用者資料
 *   - 有任何 booking / referralEvent（不論 as referrer 或 as referred）
 *     → skip，由 staff 人工判讀
 */
import { prisma } from "../src/lib/db";

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  console.log(`=== cleanup-placeholder-customers ===`);
  console.log(`mode: ${DRY_RUN ? "DRY_RUN" : "EXECUTE"}`);
  console.log();

  const candidates = await prisma.customer.findMany({
    where: {
      phone: { startsWith: "_oauth_" },
      userId: null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      storeId: true,
      createdAt: true,
      _count: {
        select: {
          bookings: true,
          referralEventsAsReferrer: true,
          referralEventsAsCustomer: true,
          referralsMade: true,
          referralsConverted: true,
          planWallets: true,
          pointRecords: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${candidates.length} placeholder Customer(s) with userId=null.`);
  console.log();

  const deletable: typeof candidates = [];
  const skipped: Array<{ c: (typeof candidates)[number]; reason: string }> = [];

  for (const c of candidates) {
    const counts = c._count;
    const total =
      counts.bookings +
      counts.referralEventsAsReferrer +
      counts.referralEventsAsCustomer +
      counts.referralsMade +
      counts.referralsConverted +
      counts.planWallets +
      counts.pointRecords;

    if (total > 0) {
      skipped.push({
        c,
        reason: `has related data (bookings=${counts.bookings}, events=${
          counts.referralEventsAsReferrer + counts.referralEventsAsCustomer
        }, referrals=${counts.referralsMade + counts.referralsConverted}, wallets=${counts.planWallets}, points=${counts.pointRecords})`,
      });
    } else {
      deletable.push(c);
    }
  }

  console.log(`Deletable (no related data): ${deletable.length}`);
  for (const c of deletable) {
    console.log(
      `  - ${c.id} | ${c.name} | ${c.phone} | email=${c.email ?? "(none)"} | store=${c.storeId} | created=${c.createdAt.toISOString()}`,
    );
  }
  console.log();

  console.log(`Skipped (has related data, needs manual review): ${skipped.length}`);
  for (const { c, reason } of skipped) {
    console.log(`  - ${c.id} | ${c.name} | ${c.phone} — ${reason}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log("DRY_RUN mode — no deletion performed.");
    console.log("Re-run without DRY_RUN=1 to actually delete.");
    return;
  }

  if (deletable.length === 0) {
    console.log("Nothing to delete. Done.");
    return;
  }

  console.log(`Deleting ${deletable.length} placeholder(s)...`);
  const ids = deletable.map((c) => c.id);
  const result = await prisma.customer.deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`Deleted ${result.count} rows.`);
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
