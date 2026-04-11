/**
 * cleanup-verify.ts — 清除後驗證：檢查 orphan records 與資料一致性
 *
 * 用法：npx tsx scripts/cleanup-verify.ts
 *
 * 驗證項目：
 * 1. 無 orphan FK（子表引用不存在的父表）
 * 2. 保留的資料完整
 * 3. 彥陸帳號正確升級
 * 4. 測試資料確實已清除
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   CLEANUP VERIFY — 清除後驗證             ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const checks: CheckResult[] = [];

  function check(name: string, pass: boolean, detail: string) {
    checks.push({ name, pass, detail });
    console.log(`  ${pass ? "✅" : "❌"} ${name}: ${detail}`);
  }

  // ── 1. 測試資料已清除 ──

  console.log("=== 1. 測試資料清除確認 ===");

  const testPhones = [
    "0911111111", "0911222222", "0911333333",
    "0922111111", "0922222222", "0922333333",
    "0933111111", "0933222222", "0933333333", "0933444444",
  ];
  const remainingTestCustomers = await prisma.customer.count({
    where: { phone: { in: testPhones } },
  });
  check("測試顧客（假門號）已清除", remainingTestCustomers === 0,
    remainingTestCustomers === 0 ? "0 筆殘留" : `${remainingTestCustomers} 筆殘留！`);

  const aliceUser = await prisma.user.findUnique({ where: { email: "alice@steamfoot.tw" } });
  check("Alice 帳號已清除", aliceUser === null,
    aliceUser ? "仍存在！" : "已刪除");

  const bobUser = await prisma.user.findUnique({ where: { email: "bob@steamfoot.tw" } });
  check("Bob 帳號已清除", bobUser === null,
    bobUser ? "仍存在！" : "已刪除");

  const carolUser = await prisma.user.findUnique({ where: { email: "carol@steamfoot.tw" } });
  check("Carol 帳號已清除", carolUser === null,
    carolUser ? "仍存在！" : "已刪除");

  const lubyCustomer = await prisma.customer.findFirst({ where: { email: "lubymusic1009@gmail.com" } });
  check("陸比音樂 Customer 已清除", lubyCustomer === null,
    lubyCustomer ? "仍存在！" : "已刪除");

  const lubyUser = await prisma.user.findUnique({ where: { email: "lubymusic1009@gmail.com" } });
  check("陸比音樂 User 已清除", lubyUser === null,
    lubyUser ? "仍存在！" : "已刪除");

  const reconCount = await prisma.reconciliationRun.count();
  check("ReconciliationRun 已清除", reconCount === 0,
    reconCount === 0 ? "0 筆" : `${reconCount} 筆殘留！`);

  // ── 2. 保留資料完整性 ──

  console.log("\n=== 2. 保留資料完整性 ===");

  // 黃芊文（已納入刪除）
  const qianwen = await prisma.customer.findFirst({
    where: { email: "passione1220@gmail.com" },
  });
  check("黃芊文已清除", qianwen === null,
    qianwen ? "仍存在！" : "已刪除");

  const qianwenUser = await prisma.user.findFirst({ where: { phone: "0988009145" } });
  check("黃芊文 User 已清除", qianwenUser === null,
    qianwenUser ? "仍存在！" : "已刪除");

  // 彥陸 Staff
  const yanlu = await prisma.user.findUnique({
    where: { email: "rock7652@gmail.com" },
    include: { staff: true },
  });
  check("彥陸 User 存在", yanlu !== null, yanlu ? `role=${yanlu.role}` : "找不到！");
  check("彥陸已升級為 OWNER", yanlu?.role === "ADMIN",
    yanlu?.role === "ADMIN" ? "正確" : `目前 role=${yanlu?.role}`);
  check("彥陸 Staff isOwner=true", yanlu?.staff?.isOwner === true,
    yanlu?.staff?.isOwner ? "正確" : "未升級！");

  // ServicePlan
  const planCount = await prisma.servicePlan.count();
  check("ServicePlan 保留", planCount === 6, `${planCount} 筆`);

  // BookingSlot
  const slotCount = await prisma.bookingSlot.count();
  check("BookingSlot 保留", slotCount === 56, `${slotCount} 筆`);

  // ── 3. Orphan FK 檢查 ──

  console.log("\n=== 3. Orphan 外鍵檢查 ===");

  // Booking → Customer
  const orphanBookings = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Booking" b
    WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = b."customerId")
  `;
  check("Booking → Customer 完整", Number(orphanBookings[0].count) === 0,
    `${orphanBookings[0].count} 筆 orphan`);

  // Booking → Staff (revenueStaffId)
  const orphanBookingStaff = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Booking" b
    WHERE b."revenueStaffId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Staff" s WHERE s.id = b."revenueStaffId")
  `;
  check("Booking → revenueStaff 完整", Number(orphanBookingStaff[0].count) === 0,
    `${orphanBookingStaff[0].count} 筆 orphan`);

  // Booking → Staff (serviceStaffId)
  const orphanBookingSvc = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Booking" b
    WHERE b."serviceStaffId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Staff" s WHERE s.id = b."serviceStaffId")
  `;
  check("Booking → serviceStaff 完整", Number(orphanBookingSvc[0].count) === 0,
    `${orphanBookingSvc[0].count} 筆 orphan`);

  // Booking → Staff (bookedByStaffId)
  const orphanBookingBy = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Booking" b
    WHERE b."bookedByStaffId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Staff" s WHERE s.id = b."bookedByStaffId")
  `;
  check("Booking → bookedByStaff 完整", Number(orphanBookingBy[0].count) === 0,
    `${orphanBookingBy[0].count} 筆 orphan`);

  // Transaction → Customer
  const orphanTxn = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Transaction" t
    WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = t."customerId")
  `;
  check("Transaction → Customer 完整", Number(orphanTxn[0].count) === 0,
    `${orphanTxn[0].count} 筆 orphan`);

  // Transaction → Staff (revenueStaffId)
  const orphanTxnStaff = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Transaction" t
    WHERE NOT EXISTS (SELECT 1 FROM "Staff" s WHERE s.id = t."revenueStaffId")
  `;
  check("Transaction → revenueStaff 完整", Number(orphanTxnStaff[0].count) === 0,
    `${orphanTxnStaff[0].count} 筆 orphan`);

  // CustomerPlanWallet → Customer
  const orphanWallet = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "CustomerPlanWallet" w
    WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = w."customerId")
  `;
  check("Wallet → Customer 完整", Number(orphanWallet[0].count) === 0,
    `${orphanWallet[0].count} 筆 orphan`);

  // Customer → User (nullable but if set, should exist)
  const orphanCustUser = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Customer" c
    WHERE c."userId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = c."userId")
  `;
  check("Customer → User 完整", Number(orphanCustUser[0].count) === 0,
    `${orphanCustUser[0].count} 筆 orphan`);

  // Customer → Staff (assignedStaffId)
  const orphanCustStaff = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Customer" c
    WHERE c."assignedStaffId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Staff" s WHERE s.id = c."assignedStaffId")
  `;
  check("Customer → assignedStaff 完整", Number(orphanCustStaff[0].count) === 0,
    `${orphanCustStaff[0].count} 筆 orphan`);

  // MakeupCredit → Customer
  const orphanMakeup = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "MakeupCredit" m
    WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = m."customerId")
  `;
  check("MakeupCredit → Customer 完整", Number(orphanMakeup[0].count) === 0,
    `${orphanMakeup[0].count} 筆 orphan`);

  // Staff → User
  const orphanStaffUser = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Staff" s
    WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = s."userId")
  `;
  check("Staff → User 完整", Number(orphanStaffUser[0].count) === 0,
    `${orphanStaffUser[0].count} 筆 orphan`);

  // ── 4. 資料總量確認 ──

  console.log("\n=== 4. 清除後資料總量 ===");

  const totals = {
    User: await prisma.user.count(),
    Staff: await prisma.staff.count(),
    Customer: await prisma.customer.count(),
    Booking: await prisma.booking.count(),
    Transaction: await prisma.transaction.count(),
    CustomerPlanWallet: await prisma.customerPlanWallet.count(),
    MakeupCredit: await prisma.makeupCredit.count(),
    ServicePlan: await prisma.servicePlan.count(),
    BookingSlot: await prisma.bookingSlot.count(),
    StaffPermission: await prisma.staffPermission.count(),
    Account: await prisma.account.count(),
    ReconciliationRun: await prisma.reconciliationRun.count(),
    CashbookEntry: await prisma.cashbookEntry.count(),
  };

  for (const [table, count] of Object.entries(totals)) {
    console.log(`  ${table.padEnd(25)} ${count} 筆`);
  }

  // ── 結果摘要 ──

  const passCount = checks.filter((c) => c.pass).length;
  const failCount = checks.filter((c) => !c.pass).length;

  console.log("\n╔══════════════════════════════════════════╗");
  if (failCount === 0) {
    console.log("║   ✅ 全部通過                              ║");
  } else {
    console.log("║   ❌ 有檢查項目未通過                       ║");
  }
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n  通過: ${passCount} / ${passCount + failCount}`);

  if (failCount > 0) {
    console.log("\n  未通過的項目：");
    for (const c of checks.filter((c) => !c.pass)) {
      console.log(`    ❌ ${c.name}: ${c.detail}`);
    }
    process.exit(1);
  }
}

main()
  .catch((e) => { console.error("VERIFY ERROR:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
