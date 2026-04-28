/**
 * diagnose-db-state.ts — 純讀取診斷（無寫入）
 *
 * 確認這顆 DB 是「有 schema 但沒資料」還是「舊 schema 殘留」。
 *
 * Usage: npx tsx scripts/diagnose-db-state.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CORE_TABLES = ["Store", "User", "Staff", "Customer", "Booking", "ServicePlan"];

// schema.prisma 中的關鍵欄位（用於對比 DB 實際欄位）
const EXPECTED_COLUMNS: Record<string, string[]> = {
  Store: [
    "id", "name", "slug", "domain", "lineDestination", "isDefault", "isDemo",
    "parentStoreId", "plan", "planStatus", "planEffectiveAt", "planExpiresAt",
    "currentSubscriptionId",
    "maxStaffOverride", "maxCustomersOverride", "maxMonthlyBookingsOverride",
    "maxMonthlyReportsOverride", "maxReminderSendsOverride", "maxStoresOverride",
    "createdAt", "updatedAt",
  ],
  User: [
    "id", "name", "email", "phone", "emailVerified", "image", "passwordHash",
    "role", "status", "createdAt", "updatedAt",
  ],
  Staff: [
    "id", "userId", "storeId", "displayName", "colorCode", "isOwner",
    "monthlySpaceFee", "spaceFeeEnabled", "status", "createdAt", "updatedAt",
  ],
  Customer: [
    "id", "userId", "storeId", "name", "phone",
  ],
  Booking: [
    "id", "customerId", "storeId", "bookingDate", "slotTime", "bookingStatus",
  ],
  ServicePlan: [
    "id", "storeId", "name", "category", "price", "sessionCount", "validityDays",
    "isActive", "publicVisible", "sortOrder", "description", "createdAt", "updatedAt",
  ],
};

async function main() {
  console.log("===== DB State Diagnosis (READ-ONLY) =====\n");

  // 1. 列出 public schema 所有 tables
  console.log("1. Tables in public schema:");
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public'
    ORDER BY table_name
  `;
  if (tables.length === 0) {
    console.log("   (no tables)");
  } else {
    for (const t of tables) console.log(`   - ${t.table_name}`);
  }
  console.log(`   Total: ${tables.length} tables\n`);

  const tableSet = new Set(tables.map((t) => t.table_name));

  // 2. _prisma_migrations 檢查
  console.log("2. _prisma_migrations 表:");
  if (tableSet.has("_prisma_migrations")) {
    const migs = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY started_at
    `;
    console.log(`   存在，含 ${migs.length} 筆紀錄:`);
    for (const m of migs) {
      const status = m.rolled_back_at ? "ROLLED_BACK" : m.finished_at ? "applied" : "PENDING";
      console.log(`   - [${status}] ${m.migration_name}`);
    }
  } else {
    console.log("   ❌ 不存在（這就是 P3005 的直接原因）");
  }
  console.log();

  // 3. 核心表 row count
  console.log("3. 核心表 row count:");
  for (const t of CORE_TABLES) {
    if (!tableSet.has(t)) {
      console.log(`   - ${t}: ❌ table 不存在`);
      continue;
    }
    try {
      const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "${t}"`
      );
      console.log(`   - ${t}: ${result[0].count}`);
    } catch (e: any) {
      console.log(`   - ${t}: ⚠️ 查詢失敗 (${e.message})`);
    }
  }
  console.log();

  // 4. 核心表欄位結構對比
  console.log("4. 欄位結構對比（schema.prisma vs DB）:");
  for (const t of CORE_TABLES) {
    if (!tableSet.has(t)) {
      console.log(`   ${t}: SKIP (table 不存在)`);
      continue;
    }
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string; is_nullable: string }>>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
       ORDER BY ordinal_position`,
      t
    );
    const dbCols = new Set(cols.map((c) => c.column_name));
    const expected = EXPECTED_COLUMNS[t] ?? [];

    const missing = expected.filter((c) => !dbCols.has(c));
    const extra = [...dbCols].filter((c) => !expected.includes(c));

    console.log(`   ${t}: DB=${dbCols.size} cols | 預期至少 ${expected.length} 核心欄位`);
    if (missing.length > 0) {
      console.log(`     ⚠️ schema 預期但 DB 缺少: ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      console.log(`     ℹ️  DB 額外欄位（schema 預期清單未列）: ${extra.slice(0, 10).join(", ")}${extra.length > 10 ? ` ...(+${extra.length - 10})` : ""}`);
    }
    if (missing.length === 0 && extra.length === 0) {
      console.log(`     ✅ 核心欄位齊備`);
    }
  }

  // 5. 額外指標：Booking 表的關鍵欄位（最容易因 schema 漂移而缺）
  console.log("\n5. Booking 表結構快照（前 20 欄位）:");
  if (tableSet.has("Booking")) {
    const cols = await prisma.$queryRaw<Array<{ column_name: string; data_type: string; is_nullable: string }>>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Booking'
      ORDER BY ordinal_position
      LIMIT 20
    `;
    for (const c of cols) {
      console.log(`   - ${c.column_name} ${c.data_type}${c.is_nullable === "YES" ? " NULL" : ""}`);
    }
  }

  console.log("\n===== Done (no writes performed) =====");
}

main()
  .catch((e) => {
    console.error("diagnose failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
