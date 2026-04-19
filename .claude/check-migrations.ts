/**
 * 一次性 DB 驗證腳本（唯讀）— 手動 SQL 上線後跑此腳本確認 ReferralEvent 結構齊全
 * 用法: set -a && source .env && set +a && npx tsx .claude/check-migrations.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const results: { check: string; actual: string; ok: boolean }[] = [];

  // 1) ReferralEventType enum
  const enumExists = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT FROM pg_type WHERE typname = 'ReferralEventType') AS exists
  `;
  results.push({
    check: "enum ReferralEventType",
    actual: String(enumExists[0].exists),
    ok: enumExists[0].exists,
  });

  // 2) ReferralEvent table
  const tableExists = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ReferralEvent'
    ) AS exists
  `;
  results.push({
    check: "table ReferralEvent",
    actual: String(tableExists[0].exists),
    ok: tableExists[0].exists,
  });

  // 3) Indexes (5 expected)
  const expectedIndexes = [
    "ReferralEvent_storeId_idx",
    "ReferralEvent_customerId_idx",
    "ReferralEvent_referrerId_idx",
    "ReferralEvent_bookingId_idx",
    "ReferralEvent_type_idx",
  ];
  const idxRows = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'ReferralEvent'
  `;
  const idxSet = new Set(idxRows.map((r) => r.indexname));
  for (const ix of expectedIndexes) {
    results.push({
      check: `index ${ix}`,
      actual: idxSet.has(ix) ? "present" : "MISSING",
      ok: idxSet.has(ix),
    });
  }

  // 4) Foreign keys (4 expected)
  const expectedFKs = [
    "ReferralEvent_storeId_fkey",
    "ReferralEvent_customerId_fkey",
    "ReferralEvent_referrerId_fkey",
    "ReferralEvent_bookingId_fkey",
  ];
  const fkRows = await prisma.$queryRaw<{ constraint_name: string }[]>`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'ReferralEvent' AND constraint_type = 'FOREIGN KEY'
  `;
  const fkSet = new Set(fkRows.map((r) => r.constraint_name));
  for (const fk of expectedFKs) {
    results.push({
      check: `fk ${fk}`,
      actual: fkSet.has(fk) ? "present" : "MISSING",
      ok: fkSet.has(fk),
    });
  }

  // 5) Smoke test — row count（上線後有事件寫入時會變非 0）
  let rowCount = 0;
  if (tableExists[0].exists) {
    const c = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "ReferralEvent"`;
    rowCount = Number(c[0].count);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("ReferralEvent DB structure check");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  let allOk = true;
  for (const r of results) {
    const mark = r.ok ? "✅" : "❌";
    console.log(`${mark} ${r.check.padEnd(50)} ${r.actual}`);
    if (!r.ok) allOk = false;
  }
  console.log(`\nCurrent ReferralEvent row count: ${rowCount}`);
  console.log(allOk ? "\n✅ ALL CHECKS PASSED" : "\n❌ SOME CHECKS FAILED");
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
