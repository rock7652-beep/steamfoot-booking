/**
 * cleanup-dry-run.ts — 測試資料清除：預覽模式（只查詢，不刪除）
 *
 * 用法：npx tsx scripts/cleanup-dry-run.ts
 *
 * 輸出：
 * 1. 每個表會刪除哪些資料（ID + 摘要）
 * 2. 會保留哪些資料
 * 3. 升級操作預覽
 * 4. 匯出備份 JSON 至 scripts/backup-before-cleanup.json
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ============================================================
// 辨識規則：明確定義要刪除的測試資料
// ============================================================

// A類：高信心測試顧客（手動建立、假門號、無登入）
const TEST_CUSTOMER_PHONES = [
  "0911111111", // 王小明
  "0911222222", // 李小華
  "0911333333", // 張美玲
  "0922111111", // 陳大偉
  "0922222222", // 林志強
  "0922333333", // 周美美
  "0933111111", // 吳家豪
  "0933222222", // 黃雅琪
  "0933333333", // 鄭小花
  "0933444444", // 劉心怡
];

// B類（已確認刪除）
const DELETE_CUSTOMER_EMAILS = [
  "lubymusic1009@gmail.com", // 陸比音樂
];

// B類（已確認刪除）— Hi.我是彥陸 的 Customer 記錄
// 注意：這個 Customer 綁在彥陸的 User 上，刪 Customer 時要先解除 userId 關聯
const DELETE_CUSTOMER_LINKED_USER_EMAIL = "rock7652@gmail.com";

// 保留的顧客
const KEEP_CUSTOMER_EMAILS = [
  "passione1220@gmail.com", // 黃芊文
];

// 要刪除的測試 Staff（User email）
const DELETE_STAFF_EMAILS = [
  "alice@steamfoot.tw",
  "bob@steamfoot.tw",
  "carol@steamfoot.tw",
];

// 要保留並升級的 Staff
const UPGRADE_STAFF_EMAIL = "rock7652@gmail.com"; // 彥陸 → OWNER

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   CLEANUP DRY RUN — 只查詢，不刪除       ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ── 1. 找出所有要刪的 Customer ID ──

  const testCustomersByPhone = await prisma.customer.findMany({
    where: { phone: { in: TEST_CUSTOMER_PHONES } },
    select: { id: true, name: true, phone: true, userId: true },
  });

  const testCustomersByEmail = await prisma.customer.findMany({
    where: { email: { in: DELETE_CUSTOMER_EMAILS } },
    select: { id: true, name: true, email: true, userId: true },
  });

  // Hi.我是彥陸 — Customer record linked to 彥陸's User
  const linkedCustomer = await prisma.customer.findFirst({
    where: {
      user: { email: DELETE_CUSTOMER_LINKED_USER_EMAIL },
      NOT: { email: { in: KEEP_CUSTOMER_EMAILS } },
    },
    select: { id: true, name: true, email: true, userId: true },
  });
  // Only include if it's not 黃芊文 and it's actually "Hi.我是彥陸"
  const linkedCustomerList = linkedCustomer && linkedCustomer.name?.includes("彥陸")
    ? [linkedCustomer]
    : [];

  const allDeleteCustomers = [
    ...testCustomersByPhone,
    ...testCustomersByEmail,
    ...linkedCustomerList,
  ];
  const deleteCustomerIds = allDeleteCustomers.map((c) => c.id);

  console.log("=== 要刪除的顧客 ===");
  for (const c of allDeleteCustomers) {
    console.log(`  [DELETE] ${c.id.slice(0, 10)} | ${c.name} | ${"phone" in c ? c.phone : ("email" in c ? c.email : "-") ?? "-"}`);
  }

  // 保留的顧客
  const keepCustomers = await prisma.customer.findMany({
    where: { id: { notIn: deleteCustomerIds } },
    select: { id: true, name: true, phone: true, email: true },
  });
  console.log("\n=== 保留的顧客 ===");
  for (const c of keepCustomers) {
    console.log(`  [KEEP]   ${c.id.slice(0, 10)} | ${c.name} | ${c.phone ?? c.email ?? "-"}`);
  }

  // ── 2. 找出要刪的 User / Staff ──

  const deleteStaffUsers = await prisma.user.findMany({
    where: { email: { in: DELETE_STAFF_EMAILS } },
    include: {
      staff: { select: { id: true, displayName: true, isOwner: true } },
    },
  });
  const deleteUserIds = deleteStaffUsers.map((u) => u.id);
  const deleteStaffIds = deleteStaffUsers.map((u) => u.staff!.id);

  // 陸比音樂的 User
  const deleteCustomerUsers = await prisma.user.findMany({
    where: { email: { in: DELETE_CUSTOMER_EMAILS } },
    select: { id: true, name: true, email: true },
  });
  const allDeleteUserIds = [...deleteUserIds, ...deleteCustomerUsers.map((u) => u.id)];

  console.log("\n=== 要刪除的 Staff ===");
  for (const u of deleteStaffUsers) {
    console.log(`  [DELETE] ${u.staff!.displayName} | ${u.email} | owner=${u.staff!.isOwner}`);
  }

  console.log("\n=== 要刪除的 User（非 Staff） ===");
  for (const u of deleteCustomerUsers) {
    console.log(`  [DELETE] ${u.name} | ${u.email}`);
  }

  // 升級的 Staff
  const upgradeUser = await prisma.user.findUnique({
    where: { email: UPGRADE_STAFF_EMAIL },
    include: { staff: true },
  });
  console.log("\n=== 要升級的 Staff ===");
  if (upgradeUser?.staff) {
    console.log(`  [UPGRADE] ${upgradeUser.staff.displayName} | ${upgradeUser.email} | role: ${upgradeUser.role} → OWNER | isOwner: ${upgradeUser.staff.isOwner} → true`);
  }

  // ── 3. 統計關聯資料 ──

  const bookingCount = await prisma.booking.count({ where: { customerId: { in: deleteCustomerIds } } });
  const transactionCount = await prisma.transaction.count({ where: { customerId: { in: deleteCustomerIds } } });
  const walletCount = await prisma.customerPlanWallet.count({ where: { customerId: { in: deleteCustomerIds } } });
  const makeupCount = await prisma.makeupCredit.count({ where: { customerId: { in: deleteCustomerIds } } });
  const permissionCount = await prisma.staffPermission.count({ where: { staffId: { in: deleteStaffIds } } });
  const accountCount = await prisma.account.count({ where: { userId: { in: allDeleteUserIds } } });
  const sessionCount = await prisma.session.count({ where: { userId: { in: allDeleteUserIds } } });
  const reconRunCount = await prisma.reconciliationRun.count();
  const reconCheckCount = await prisma.reconciliationCheck.count();

  // 檢查 Booking 是否有指向要刪 Staff 的外鍵
  const bookingsRefDeletedStaff = await prisma.booking.count({
    where: {
      customerId: { notIn: deleteCustomerIds }, // 不在刪除名單的預約
      OR: [
        { revenueStaffId: { in: deleteStaffIds } },
        { serviceStaffId: { in: deleteStaffIds } },
        { bookedByStaffId: { in: deleteStaffIds } },
      ],
    },
  });

  const txnsRefDeletedStaff = await prisma.transaction.count({
    where: {
      customerId: { notIn: deleteCustomerIds },
      OR: [
        { revenueStaffId: { in: deleteStaffIds } },
        { serviceStaffId: { in: deleteStaffIds } },
      ],
    },
  });

  // CashbookEntry 引用要刪的 User/Staff
  const cashbookRefCount = await prisma.cashbookEntry.count({
    where: {
      OR: [
        { createdByUserId: { in: allDeleteUserIds } },
        { staffId: { in: deleteStaffIds } },
      ],
    },
  });

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   刪除摘要                                ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`  Customer:            ${allDeleteCustomers.length} 筆`);
  console.log(`  User:                ${allDeleteUserIds.length} 筆`);
  console.log(`  Staff:               ${deleteStaffIds.length} 筆`);
  console.log(`  Booking:             ${bookingCount} 筆`);
  console.log(`  Transaction:         ${transactionCount} 筆`);
  console.log(`  CustomerPlanWallet:  ${walletCount} 筆`);
  console.log(`  MakeupCredit:        ${makeupCount} 筆`);
  console.log(`  StaffPermission:     ${permissionCount} 筆`);
  console.log(`  Account (OAuth):     ${accountCount} 筆`);
  console.log(`  Session:             ${sessionCount} 筆`);
  console.log(`  ReconciliationRun:   ${reconRunCount} 筆`);
  console.log(`  ReconciliationCheck: ${reconCheckCount} 筆`);
  console.log(`  CashbookEntry:       ${cashbookRefCount} 筆`);

  console.log("\n=== 保留的資料 ===");
  console.log(`  Customer:            ${keepCustomers.length} 筆（${keepCustomers.map((c) => c.name).join("、")}）`);
  console.log(`  User:                1 筆（彥陸 → 升級 OWNER）`);
  console.log(`  Staff:               1 筆（彥陸 → isOwner=true）`);
  console.log(`  ServicePlan:         6 筆（不動）`);
  console.log(`  BookingSlot:         56 筆（不動）`);

  // ── 4. 外鍵安全檢查 ──

  console.log("\n=== 外鍵安全檢查 ===");
  if (bookingsRefDeletedStaff > 0) {
    console.log(`  ⚠ ${bookingsRefDeletedStaff} 筆保留的 Booking 引用了要刪的 Staff`);
    console.log(`    → 這些 Booking 的 staff FK 會在正式清除時設為 NULL`);
  } else {
    console.log(`  ✓ 無保留 Booking 引用要刪的 Staff`);
  }

  if (txnsRefDeletedStaff > 0) {
    console.log(`  ⚠ ${txnsRefDeletedStaff} 筆保留的 Transaction 引用了要刪的 Staff`);
    console.log(`    → 這些 Transaction 的 staff FK 會在正式清除時轉移給彥陸`);
  } else {
    console.log(`  ✓ 無保留 Transaction 引用要刪的 Staff`);
  }

  if (cashbookRefCount > 0) {
    console.log(`  ⚠ ${cashbookRefCount} 筆 CashbookEntry 引用要刪的 User/Staff`);
  } else {
    console.log(`  ✓ 無 CashbookEntry 引用要刪的 User/Staff`);
  }

  // 檢查 Hi.我是彥陸 的 Customer 是否需要先解除 userId
  if (linkedCustomerList.length > 0) {
    console.log(`  ⚠ Customer「${linkedCustomerList[0].name}」綁在彥陸的 User 上`);
    console.log(`    → 正式清除時會先將 Customer.userId 設為 NULL，再刪除 Customer`);
  }

  // ── 5. 匯出備份 JSON ──

  console.log("\n=== 匯出備份 ===");

  const backupData = {
    exportedAt: new Date().toISOString(),
    purpose: "Pre-cleanup backup of test data",
    customers: await prisma.customer.findMany({ where: { id: { in: deleteCustomerIds } } }),
    users: await prisma.user.findMany({ where: { id: { in: allDeleteUserIds } } }),
    staff: await prisma.staff.findMany({ where: { id: { in: deleteStaffIds } } }),
    bookings: await prisma.booking.findMany({ where: { customerId: { in: deleteCustomerIds } } }),
    transactions: await prisma.transaction.findMany({ where: { customerId: { in: deleteCustomerIds } } }),
    wallets: await prisma.customerPlanWallet.findMany({ where: { customerId: { in: deleteCustomerIds } } }),
    makeupCredits: await prisma.makeupCredit.findMany({ where: { customerId: { in: deleteCustomerIds } } }),
    staffPermissions: await prisma.staffPermission.findMany({ where: { staffId: { in: deleteStaffIds } } }),
    accounts: await prisma.account.findMany({ where: { userId: { in: allDeleteUserIds } } }),
    reconciliationRuns: await prisma.reconciliationRun.findMany({ include: { checks: true } }),
    // 也備份要升級的帳號（升級前狀態）
    upgradeUser: upgradeUser,
  };

  const backupPath = path.join(__dirname, "backup-before-cleanup.json");
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), "utf-8");
  console.log(`  ✓ 備份已匯出至: ${backupPath}`);
  console.log(`  ✓ 檔案大小: ${(fs.statSync(backupPath).size / 1024).toFixed(1)} KB`);

  // ── 6. 最終確認提示 ──

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   DRY RUN 完成 — 未執行任何刪除           ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log("║   下一步：                                 ║");
  console.log("║   1. 檢查上方輸出是否符合預期              ║");
  console.log("║   2. 確認備份 JSON 已儲存                  ║");
  console.log("║   3. 到 Supabase Dashboard 做 DB 快照     ║");
  console.log("║   4. 確認後執行: npx tsx scripts/cleanup-execute.ts ║");
  console.log("╚══════════════════════════════════════════╝");
}

main()
  .catch((e) => { console.error("DRY RUN ERROR:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
