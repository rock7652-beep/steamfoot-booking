/**
 * cleanup-execute.ts — 測試資料清除：正式執行模式
 *
 * 用法：npx tsx scripts/cleanup-execute.ts
 *
 * 安全機制：
 * 1. 必須先執行 dry-run 產生備份 JSON
 * 2. 全部包在 $transaction 裡，失敗自動 rollback
 * 3. 每步都輸出 log
 * 4. 最後輸出完整刪除摘要
 *
 * ⚠ 此 script 會真正刪除資料，請確認：
 *    - 已檢查 dry-run 輸出
 *    - 已確認備份 JSON 存在
 *    - 已在 Supabase Dashboard 做 DB 快照
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ============================================================
// 辨識規則（與 dry-run 完全一致）
// ============================================================

const TEST_CUSTOMER_PHONES = [
  "0911111111", "0911222222", "0911333333",
  "0922111111", "0922222222", "0922333333",
  "0933111111", "0933222222", "0933333333", "0933444444",
];

const DELETE_CUSTOMER_EMAILS = ["lubymusic1009@gmail.com", "passione1220@gmail.com"];
const DELETE_CUSTOMER_LINKED_USER_EMAIL = "rock7652@gmail.com";

const DELETE_STAFF_EMAILS = [
  "alice@steamfoot.tw",
  "bob@steamfoot.tw",
  "carol@steamfoot.tw",
];

const UPGRADE_STAFF_EMAIL = "rock7652@gmail.com";

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   CLEANUP EXECUTE — 正式清除模式          ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ── 0. 安全檢查：備份 JSON 必須存在 ──

  const backupPath = path.join(__dirname, "backup-before-cleanup.json");
  if (!fs.existsSync(backupPath)) {
    console.error("❌ 找不到備份檔 backup-before-cleanup.json");
    console.error("   請先執行: npx tsx scripts/cleanup-dry-run.ts");
    process.exit(1);
  }

  const backupStat = fs.statSync(backupPath);
  const backupAgeMs = Date.now() - backupStat.mtimeMs;
  if (backupAgeMs > 24 * 60 * 60 * 1000) {
    console.error("❌ 備份檔已超過 24 小時，請重新執行 dry-run");
    process.exit(1);
  }

  console.log(`✓ 備份檔存在: ${backupPath} (${(backupStat.size / 1024).toFixed(1)} KB)`);

  // ── 1. 蒐集要刪除的 ID ──

  const testCustomersByPhone = await prisma.customer.findMany({
    where: { phone: { in: TEST_CUSTOMER_PHONES } },
    select: { id: true, name: true },
  });

  const testCustomersByEmail = await prisma.customer.findMany({
    where: { email: { in: DELETE_CUSTOMER_EMAILS } },
    select: { id: true, name: true, userId: true },
  });

  const linkedCustomer = await prisma.customer.findFirst({
    where: { user: { email: DELETE_CUSTOMER_LINKED_USER_EMAIL } },
    select: { id: true, name: true, userId: true },
  });
  const linkedCustomerList = linkedCustomer && linkedCustomer.name?.includes("彥陸")
    ? [linkedCustomer]
    : [];

  const allDeleteCustomers = [...testCustomersByPhone, ...testCustomersByEmail, ...linkedCustomerList];
  const deleteCustomerIds = allDeleteCustomers.map((c) => c.id);

  const deleteStaffUsers = await prisma.user.findMany({
    where: { email: { in: DELETE_STAFF_EMAILS } },
    include: { staff: { select: { id: true, displayName: true } } },
  });
  const deleteStaffIds = deleteStaffUsers.map((u) => u.staff!.id);
  const deleteStaffUserIds = deleteStaffUsers.map((u) => u.id);

  const deleteCustomerUsers = await prisma.user.findMany({
    where: { email: { in: DELETE_CUSTOMER_EMAILS } },
    select: { id: true },
  });

  // 黃芊文的 User 是 phone login（email=null），需另外查
  const qianwenUser = await prisma.user.findFirst({
    where: { phone: "0988009145" },
    select: { id: true },
  });

  const allDeleteUserIds = [
    ...deleteStaffUserIds,
    ...deleteCustomerUsers.map((u) => u.id),
    ...(qianwenUser ? [qianwenUser.id] : []),
  ];

  const upgradeUser = await prisma.user.findUnique({
    where: { email: UPGRADE_STAFF_EMAIL },
    include: { staff: true },
  });

  if (!upgradeUser || !upgradeUser.staff) {
    console.error("❌ 找不到要升級的 Staff（彥陸）");
    process.exit(1);
  }

  console.log(`  要刪除: ${deleteCustomerIds.length} 顧客, ${deleteStaffIds.length} 店長, ${allDeleteUserIds.length} 使用者`);
  console.log(`  要升級: ${upgradeUser.staff.displayName} → OWNER\n`);

  // ── 2. 在 Transaction 內執行所有操作 ──

  const result = await prisma.$transaction(async (tx) => {
    const log: string[] = [];
    const counts: Record<string, number> = {};

    function step(msg: string, count?: number) {
      const entry = count !== undefined ? `${msg}: ${count}` : msg;
      log.push(entry);
      console.log(`  → ${entry}`);
    }

    // Step 1: 刪除 ReconciliationCheck（由 CASCADE 處理，但明確刪更安全）
    const r1 = await tx.reconciliationCheck.deleteMany({});
    step("刪除 ReconciliationCheck", r1.count);
    counts.reconciliationChecks = r1.count;

    // Step 2: 刪除 ReconciliationRun
    const r2 = await tx.reconciliationRun.deleteMany({});
    step("刪除 ReconciliationRun", r2.count);
    counts.reconciliationRuns = r2.count;

    // Step 3: 刪除 StaffPermission（要刪的 staff）
    const r3 = await tx.staffPermission.deleteMany({
      where: { staffId: { in: deleteStaffIds } },
    });
    step("刪除 StaffPermission", r3.count);
    counts.staffPermissions = r3.count;

    // Step 4: 刪除 Reminder（要刪的顧客的預約）
    const bookingIds = (await tx.booking.findMany({
      where: { customerId: { in: deleteCustomerIds } },
      select: { id: true },
    })).map((b) => b.id);

    const r4 = await tx.reminder.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    step("刪除 Reminder", r4.count);
    counts.reminders = r4.count;

    // Step 5: 刪除 MakeupCredit
    const r5 = await tx.makeupCredit.deleteMany({
      where: { customerId: { in: deleteCustomerIds } },
    });
    step("刪除 MakeupCredit", r5.count);
    counts.makeupCredits = r5.count;

    // Step 6: 刪除 Transaction（要刪的顧客）
    const r6 = await tx.transaction.deleteMany({
      where: { customerId: { in: deleteCustomerIds } },
    });
    step("刪除 Transaction", r6.count);
    counts.transactions = r6.count;

    // Step 7: 處理保留顧客的 Booking 中引用要刪 Staff 的 FK
    // 黃芊文的預約: revenueStaffId 指向彥陸（保留），不需處理
    // 但以防萬一，把所有指向要刪 Staff 的 FK 設為 NULL 或轉給彥陸
    const r7a = await tx.booking.updateMany({
      where: {
        customerId: { notIn: deleteCustomerIds },
        revenueStaffId: { in: deleteStaffIds },
      },
      data: { revenueStaffId: upgradeUser.staff!.id },
    });
    if (r7a.count > 0) step("轉移保留 Booking 的 revenueStaffId → 彥陸", r7a.count);

    const r7b = await tx.booking.updateMany({
      where: {
        customerId: { notIn: deleteCustomerIds },
        serviceStaffId: { in: deleteStaffIds },
      },
      data: { serviceStaffId: null },
    });
    if (r7b.count > 0) step("清除保留 Booking 的 serviceStaffId", r7b.count);

    const r7c = await tx.booking.updateMany({
      where: {
        customerId: { notIn: deleteCustomerIds },
        bookedByStaffId: { in: deleteStaffIds },
      },
      data: { bookedByStaffId: null },
    });
    if (r7c.count > 0) step("清除保留 Booking 的 bookedByStaffId", r7c.count);

    // 同樣處理 Transaction 的 Staff FK
    const r7d = await tx.transaction.updateMany({
      where: {
        customerId: { notIn: deleteCustomerIds },
        revenueStaffId: { in: deleteStaffIds },
      },
      data: { revenueStaffId: upgradeUser.staff!.id },
    });
    if (r7d.count > 0) step("轉移保留 Transaction 的 revenueStaffId → 彥陸", r7d.count);

    const r7e = await tx.transaction.updateMany({
      where: {
        customerId: { notIn: deleteCustomerIds },
        serviceStaffId: { in: deleteStaffIds },
      },
      data: { serviceStaffId: null },
    });
    if (r7e.count > 0) step("清除保留 Transaction 的 serviceStaffId", r7e.count);

    // Step 8: 刪除 Booking（要刪的顧客）
    const r8 = await tx.booking.deleteMany({
      where: { customerId: { in: deleteCustomerIds } },
    });
    step("刪除 Booking", r8.count);
    counts.bookings = r8.count;

    // Step 9: 刪除 CustomerPlanWallet（要刪的顧客）
    const r9 = await tx.customerPlanWallet.deleteMany({
      where: { customerId: { in: deleteCustomerIds } },
    });
    step("刪除 CustomerPlanWallet", r9.count);
    counts.wallets = r9.count;

    // Step 10: 解除 Hi.我是彥陸 的 Customer → User 關聯
    if (linkedCustomerList.length > 0) {
      await tx.customer.update({
        where: { id: linkedCustomerList[0].id },
        data: { userId: null },
      });
      step("解除 Customer「Hi.我是彥陸」的 userId 關聯");
    }

    // Step 11: 處理保留顧客的 assignedStaffId（若指向要刪的 Staff）
    const r11 = await tx.customer.updateMany({
      where: {
        id: { notIn: deleteCustomerIds },
        assignedStaffId: { in: deleteStaffIds },
      },
      data: { assignedStaffId: upgradeUser.staff!.id },
    });
    if (r11.count > 0) step("轉移保留顧客的 assignedStaffId → 彥陸", r11.count);

    // Step 12: 刪除 Customer
    const r12 = await tx.customer.deleteMany({
      where: { id: { in: deleteCustomerIds } },
    });
    step("刪除 Customer", r12.count);
    counts.customers = r12.count;

    // Step 13: 刪除 Account（OAuth，要刪的 User）
    const r13 = await tx.account.deleteMany({
      where: { userId: { in: allDeleteUserIds } },
    });
    step("刪除 Account (OAuth)", r13.count);
    counts.accounts = r13.count;

    // Step 14: 刪除 Session（要刪的 User）
    const r14 = await tx.session.deleteMany({
      where: { userId: { in: allDeleteUserIds } },
    });
    step("刪除 Session", r14.count);
    counts.sessions = r14.count;

    // Step 15: 刪除 SpaceFeeRecord（要刪的 Staff）
    const r15 = await tx.spaceFeeRecord.deleteMany({
      where: { staffId: { in: deleteStaffIds } },
    });
    if (r15.count > 0) step("刪除 SpaceFeeRecord", r15.count);
    counts.spaceFees = r15.count;

    // Step 16: 刪除 CashbookEntry（引用要刪的 User/Staff）
    const r16 = await tx.cashbookEntry.deleteMany({
      where: {
        OR: [
          { createdByUserId: { in: allDeleteUserIds } },
          { staffId: { in: deleteStaffIds } },
        ],
      },
    });
    if (r16.count > 0) step("刪除 CashbookEntry", r16.count);
    counts.cashbook = r16.count;

    // Step 17: 刪除 AuditLog（引用要刪的 User）
    const r17 = await tx.auditLog.deleteMany({
      where: { actorUserId: { in: allDeleteUserIds } },
    });
    if (r17.count > 0) step("刪除 AuditLog", r17.count);
    counts.auditLogs = r17.count;

    // Step 18: 刪除 Staff（不含彥陸）
    const r18 = await tx.staff.deleteMany({
      where: { id: { in: deleteStaffIds } },
    });
    step("刪除 Staff", r18.count);
    counts.staff = r18.count;

    // Step 19: 刪除 User（不含彥陸）
    const r19 = await tx.user.deleteMany({
      where: { id: { in: allDeleteUserIds } },
    });
    step("刪除 User", r19.count);
    counts.users = r19.count;

    // Step 20: 升級彥陸
    await tx.user.update({
      where: { id: upgradeUser.id },
      data: { role: "ADMIN" },
    });
    step("升級 User 彥陸 → role=OWNER");

    await tx.staff.update({
      where: { id: upgradeUser.staff!.id },
      data: { isOwner: true },
    });
    step("升級 Staff 彥陸 → isOwner=true");

    return { log, counts };
  }, {
    timeout: 30000, // 30 秒 timeout
  });

  // ── 3. 輸出結果 ──

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   ✅ 清除完成                              ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("\n=== 刪除摘要 ===");
  for (const [key, count] of Object.entries(result.counts)) {
    if (count > 0) console.log(`  ${key.padEnd(22)} ${count} 筆`);
  }

  console.log("\n=== 執行記錄 ===");
  for (const entry of result.log) {
    console.log(`  ${entry}`);
  }

  // 儲存執行記錄
  const logPath = path.join(__dirname, "cleanup-execution-log.json");
  fs.writeFileSync(logPath, JSON.stringify({
    executedAt: new Date().toISOString(),
    counts: result.counts,
    log: result.log,
  }, null, 2), "utf-8");
  console.log(`\n✓ 執行記錄已儲存至: ${logPath}`);

  console.log("\n下一步：npx tsx scripts/cleanup-verify.ts");
}

main()
  .catch((e) => {
    console.error("\n╔══════════════════════════════════════════╗");
    console.error("║   ❌ 執行失敗 — 已自動 ROLLBACK           ║");
    console.error("╚══════════════════════════════════════════╝");
    console.error("\n錯誤詳情:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
