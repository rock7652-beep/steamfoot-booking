/**
 * Staging Seed — Steamfoot Preview / Staging DB
 *
 * 用途：給 Vercel Preview 環境用的乾淨測試資料 + 固定測試帳號，
 *      避免之後再用正式帳號（如 rock7652@gmail.com）測 Preview，
 *      也避免測試資料寫進 Production DB。
 *
 * 執行：npm run seed:staging
 *      （需先把 DATABASE_URL / DIRECT_URL 指向 staging Supabase project）
 *
 * 安全特性：
 *   - 所有資料 scope 在 storeId='staging-store'（不動其他 store）
 *   - 全 upsert + 固定 ID，可任意重跑
 *   - 不 TRUNCATE 任何 table
 *   - 不呼叫任何外部 API（LINE / Resend / fetch）
 *   - 不使用任何正式 email / 正式 slug（不出現 zhubei / steamfoot.tw / rock7652）
 *
 * ⚠️ 跑之前請務必確認 DATABASE_URL 指向 staging 而非 production！
 *    最壞情況：本 script 會在指向的 DB 內建立 staging-store + 相關 demo 資料；
 *    若誤跑進 prod，可用 `DELETE FROM "Store" WHERE id='staging-store'` 連同
 *    cascade 清掉所有 demo 資料。
 *
 * 設計：對齊 docs/deployment.md「Preview must not point to production database」
 */

import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

// ============================================================
// 常數 — 固定 ID 讓 seed 完全 idempotent（每次 upsert 同一 row）
// ============================================================

const STORE_ID = "staging-store";
const STORE_SLUG = "staging";
const STORE_NAME = "Steamfoot Staging / 測試店";

const OWNER_EMAIL = "owner@staging.local";
const OWNER_USER_ID = "staging-user-owner";
const OWNER_STAFF_ID = "staging-staff-owner";

const PARTNER_EMAIL = "partner@staging.local";
const PARTNER_USER_ID = "staging-user-partner";
const PARTNER_STAFF_ID = "staging-staff-partner";

const PASSWORD_PLAIN = "staging1234";

const PLAN_ID = "staging-plan-pkg10";

const CUSTOMER_IDS = [
  "staging-cust-001",
  "staging-cust-002",
  "staging-cust-003",
  "staging-cust-004",
  "staging-cust-005",
] as const;

const WALLET_IDS = ["staging-wallet-001", "staging-wallet-002"] as const;

const BOOKING_IDS = [
  "staging-booking-001",
  "staging-booking-002",
  "staging-booking-003",
] as const;

const TX_IDS = ["staging-tx-001", "staging-tx-002", "staging-tx-003"] as const;

// ============================================================
// 鏡像自 src/lib/permissions.ts —
// seed 不 import app code，避免循環依賴與 alias 解析問題。
// 若 DEFAULT_*_PERMISSIONS 在 src 改動，這裡需同步。
// ============================================================

const DEFAULT_OWNER_PERMISSIONS = [
  "customer.read",
  "customer.create",
  "customer.update",
  "customer.assign",
  "customer.export",
  "booking.read",
  "booking.create",
  "booking.update",
  "transaction.read",
  "transaction.create",
  "transaction.discount",
  "transaction.void",
  "transaction.refund",
  "wallet.read",
  "wallet.create",
  "wallet.adjust",
  "plans.edit",
  "business_hours.view",
  "business_hours.manage",
  "report.read",
  "report.export",
  "cashbook.read",
  "cashbook.create",
  "cashDrawer.read",
  "cashDrawer.open",
  "cashDrawer.close",
  "cashDrawer.entry",
  "staff.view",
  "duty.read",
  "duty.manage",
  "talent.read",
  "talent.manage",
];

const DEFAULT_PARTNER_PERMISSIONS = [
  "customer.read",
  "customer.create",
  "customer.update",
  "booking.read",
  "booking.create",
  "booking.update",
  "transaction.read",
  "transaction.create",
  "transaction.discount",
  "wallet.read",
  "wallet.create",
  "business_hours.view",
  "cashbook.read",
  "cashbook.create",
  "cashDrawer.read",
  "duty.read",
  "talent.read",
];

// ============================================================
// Helpers
// ============================================================

function maskDbUrl(url: string | undefined): string {
  if (!url) return "(DATABASE_URL not set)";
  try {
    const u = new URL(url);
    // 只顯示 host + db name，不漏密碼
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

function daysFromToday(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ============================================================
// Main
// ============================================================

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("🚫 DATABASE_URL is not set — seed aborted.");
    console.error("   Set DATABASE_URL to your staging Supabase pooled URL before running.");
    process.exit(1);
  }

  console.log("=== Steamfoot Staging Seed ===");
  console.log(`Target DB: ${maskDbUrl(process.env.DATABASE_URL)}`);
  console.log(`Store: ${STORE_ID} (slug=${STORE_SLUG}, name=${STORE_NAME})`);
  console.log("");
  console.log("⚠️  本 script 會在 DATABASE_URL 指向的 DB 內建立 staging-store + demo 資料。");
  console.log("   若誤指向 production，請立即 Ctrl+C 取消。");
  console.log("");

  // ────────────────────────────────────────────────────────
  // 1. Store + ShopConfig
  // ────────────────────────────────────────────────────────
  await prisma.store.upsert({
    where: { id: STORE_ID },
    create: {
      id: STORE_ID,
      name: STORE_NAME,
      slug: STORE_SLUG,
      isDefault: false,
      isDemo: true, // schema 已支援，明確標示為 demo 店
      plan: "GROWTH",
      planStatus: "ACTIVE",
    },
    update: {
      name: STORE_NAME,
      slug: STORE_SLUG,
      isDemo: true,
    },
  });
  console.log(`  ✓ Store: ${STORE_NAME}`);

  await prisma.shopConfig.upsert({
    where: { storeId: STORE_ID },
    create: {
      storeId: STORE_ID,
      shopName: STORE_NAME,
    },
    update: { shopName: STORE_NAME },
  });

  // ────────────────────────────────────────────────────────
  // 2. BookingSlots — 一週基本時段（讓前台預約頁有東西可點）
  //    每週一/三/五的 10:00 / 14:00 / 19:00
  // ────────────────────────────────────────────────────────
  const slotConfig: { dayOfWeek: number; startTime: string }[] = [
    { dayOfWeek: 1, startTime: "10:00" },
    { dayOfWeek: 1, startTime: "14:00" },
    { dayOfWeek: 1, startTime: "19:00" },
    { dayOfWeek: 3, startTime: "10:00" },
    { dayOfWeek: 3, startTime: "14:00" },
    { dayOfWeek: 3, startTime: "19:00" },
    { dayOfWeek: 5, startTime: "10:00" },
    { dayOfWeek: 5, startTime: "14:00" },
    { dayOfWeek: 5, startTime: "19:00" },
  ];
  for (const s of slotConfig) {
    await prisma.bookingSlot.upsert({
      where: {
        storeId_dayOfWeek_startTime: {
          storeId: STORE_ID,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
        },
      },
      create: {
        storeId: STORE_ID,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        capacity: 6,
        isEnabled: true,
      },
      update: { isEnabled: true, capacity: 6 },
    });
  }
  console.log(`  ✓ BookingSlots: ${slotConfig.length} 個時段（週一/三/五 × 3）`);

  // ────────────────────────────────────────────────────────
  // 3. OWNER + PARTNER (User → Staff → Permissions)
  // ────────────────────────────────────────────────────────
  const pwHash = hashSync(PASSWORD_PLAIN, 10);

  // OWNER
  await prisma.user.upsert({
    where: { id: OWNER_USER_ID },
    create: {
      id: OWNER_USER_ID,
      name: "Staging Owner",
      email: OWNER_EMAIL,
      phone: "0900000001",
      passwordHash: pwHash,
      role: "OWNER",
    },
    update: {
      name: "Staging Owner",
      email: OWNER_EMAIL,
      passwordHash: pwHash,
      role: "OWNER",
    },
  });
  await prisma.staff.upsert({
    where: { id: OWNER_STAFF_ID },
    create: {
      id: OWNER_STAFF_ID,
      userId: OWNER_USER_ID,
      storeId: STORE_ID,
      displayName: "Staging Owner",
      colorCode: "#6366f1",
      isOwner: true,
      monthlySpaceFee: 0,
      spaceFeeEnabled: false,
    },
    update: {
      displayName: "Staging Owner",
      storeId: STORE_ID,
      isOwner: true,
    },
  });
  for (const perm of DEFAULT_OWNER_PERMISSIONS) {
    await prisma.staffPermission.upsert({
      where: { staffId_permission: { staffId: OWNER_STAFF_ID, permission: perm } },
      create: { staffId: OWNER_STAFF_ID, permission: perm, granted: true },
      update: { granted: true },
    });
  }
  console.log(`  ✓ OWNER: ${OWNER_EMAIL}`);

  // PARTNER
  await prisma.user.upsert({
    where: { id: PARTNER_USER_ID },
    create: {
      id: PARTNER_USER_ID,
      name: "Staging Partner",
      email: PARTNER_EMAIL,
      phone: "0900000002",
      passwordHash: pwHash,
      role: "OWNER", // OWNER role 給雙人用；單純 staff 透過 isOwner=false + 較少 permissions 區分
    },
    update: {
      name: "Staging Partner",
      email: PARTNER_EMAIL,
      passwordHash: pwHash,
    },
  });
  await prisma.staff.upsert({
    where: { id: PARTNER_STAFF_ID },
    create: {
      id: PARTNER_STAFF_ID,
      userId: PARTNER_USER_ID,
      storeId: STORE_ID,
      displayName: "Staging Partner",
      colorCode: "#10b981",
      isOwner: false, // 關鍵：合作店長
      monthlySpaceFee: 0,
      spaceFeeEnabled: false,
    },
    update: {
      displayName: "Staging Partner",
      storeId: STORE_ID,
      isOwner: false,
    },
  });
  for (const perm of DEFAULT_PARTNER_PERMISSIONS) {
    await prisma.staffPermission.upsert({
      where: { staffId_permission: { staffId: PARTNER_STAFF_ID, permission: perm } },
      create: { staffId: PARTNER_STAFF_ID, permission: perm, granted: true },
      update: { granted: true },
    });
  }
  console.log(`  ✓ PARTNER: ${PARTNER_EMAIL}`);

  // ────────────────────────────────────────────────────────
  // 4. ServicePlan — 1 個 10 堂套餐
  // ────────────────────────────────────────────────────────
  await prisma.servicePlan.upsert({
    where: { id: PLAN_ID },
    create: {
      id: PLAN_ID,
      storeId: STORE_ID,
      name: "10 堂套餐（Staging）",
      category: "PACKAGE",
      price: 3000,
      sessionCount: 10,
      validityDays: 180,
      isActive: true,
      publicVisible: true,
      sortOrder: 1,
      description: "Staging 測試用 10 堂套餐，180 天有效",
    },
    update: {
      name: "10 堂套餐（Staging）",
      storeId: STORE_ID,
      price: 3000,
      sessionCount: 10,
    },
  });
  console.log(`  ✓ ServicePlan: 10 堂套餐 (NT$3000)`);

  // ────────────────────────────────────────────────────────
  // 5. Customers — 5 位 demo 顧客
  // ────────────────────────────────────────────────────────
  const customerSpec: Array<{
    id: string;
    name: string;
    phone: string;
    stage: "LEAD" | "TRIAL" | "ACTIVE" | "INACTIVE";
  }> = [
    { id: CUSTOMER_IDS[0], name: "測試顧客 A", phone: "0911000001", stage: "ACTIVE" },
    { id: CUSTOMER_IDS[1], name: "測試顧客 B", phone: "0911000002", stage: "ACTIVE" },
    { id: CUSTOMER_IDS[2], name: "測試顧客 C", phone: "0911000003", stage: "TRIAL" },
    { id: CUSTOMER_IDS[3], name: "測試顧客 D", phone: "0911000004", stage: "LEAD" },
    { id: CUSTOMER_IDS[4], name: "測試顧客 E", phone: "0911000005", stage: "LEAD" },
  ];
  for (const c of customerSpec) {
    await prisma.customer.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        storeId: STORE_ID,
        name: c.name,
        phone: c.phone,
        // 刻意不設 email / lineUserId / googleId — 避免與任何正式資料 unique 撞
        assignedStaffId: OWNER_STAFF_ID,
        customerStage: c.stage,
        selfBookingEnabled: false,
      },
      update: {
        name: c.name,
        phone: c.phone,
        storeId: STORE_ID,
        customerStage: c.stage,
      },
    });
  }
  console.log(`  ✓ Customers: 5 位（${CUSTOMER_IDS[0]} ~ ${CUSTOMER_IDS[4]}）`);

  // ────────────────────────────────────────────────────────
  // 6. Wallets — 前 2 位顧客各買 1 個 10 堂套餐
  // ────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(today);
  expiry.setDate(expiry.getDate() + 180);

  await prisma.customerPlanWallet.upsert({
    where: { id: WALLET_IDS[0] },
    create: {
      id: WALLET_IDS[0],
      customerId: CUSTOMER_IDS[0],
      storeId: STORE_ID,
      planId: PLAN_ID,
      purchasedPrice: 3000,
      totalSessions: 10,
      remainingSessions: 9, // 假設已用 1 堂
      startDate: today,
      expiryDate: expiry,
      status: "ACTIVE",
    },
    update: {
      remainingSessions: 9,
      status: "ACTIVE",
    },
  });

  await prisma.customerPlanWallet.upsert({
    where: { id: WALLET_IDS[1] },
    create: {
      id: WALLET_IDS[1],
      customerId: CUSTOMER_IDS[1],
      storeId: STORE_ID,
      planId: PLAN_ID,
      purchasedPrice: 3000,
      totalSessions: 10,
      remainingSessions: 10,
      startDate: today,
      expiryDate: expiry,
      status: "ACTIVE",
    },
    update: {
      remainingSessions: 10,
      status: "ACTIVE",
    },
  });
  console.log(`  ✓ Wallets: 2 個（綁顧客 A、B，10 堂套餐）`);

  // ────────────────────────────────────────────────────────
  // 7. Bookings — 3 筆預約涵蓋過去 / 今天 / 未來
  //    Booking-001: 顧客 A，昨日，COMPLETED，使用 wallet
  //    Booking-002: 顧客 B，今日，PENDING，使用 wallet
  //    Booking-003: 顧客 C（trial），下週一，PENDING，單次
  // ────────────────────────────────────────────────────────
  await prisma.booking.upsert({
    where: { id: BOOKING_IDS[0] },
    create: {
      id: BOOKING_IDS[0],
      customerId: CUSTOMER_IDS[0],
      storeId: STORE_ID,
      bookingDate: daysFromToday(-1),
      slotTime: "10:00",
      revenueStaffId: OWNER_STAFF_ID,
      serviceStaffId: OWNER_STAFF_ID,
      bookingType: "PACKAGE_SESSION",
      servicePlanId: PLAN_ID,
      customerPlanWalletId: WALLET_IDS[0],
      people: 1,
      bookingStatus: "COMPLETED",
    },
    update: {
      bookingStatus: "COMPLETED",
      revenueStaffId: OWNER_STAFF_ID,
    },
  });

  await prisma.booking.upsert({
    where: { id: BOOKING_IDS[1] },
    create: {
      id: BOOKING_IDS[1],
      customerId: CUSTOMER_IDS[1],
      storeId: STORE_ID,
      bookingDate: daysFromToday(0),
      slotTime: "14:00",
      revenueStaffId: OWNER_STAFF_ID,
      serviceStaffId: OWNER_STAFF_ID,
      bookingType: "PACKAGE_SESSION",
      servicePlanId: PLAN_ID,
      customerPlanWalletId: WALLET_IDS[1],
      people: 1,
      bookingStatus: "PENDING",
    },
    update: {
      bookingStatus: "PENDING",
    },
  });

  await prisma.booking.upsert({
    where: { id: BOOKING_IDS[2] },
    create: {
      id: BOOKING_IDS[2],
      customerId: CUSTOMER_IDS[2],
      storeId: STORE_ID,
      bookingDate: daysFromToday(7),
      slotTime: "19:00",
      revenueStaffId: PARTNER_STAFF_ID,
      bookingType: "SINGLE",
      servicePlanId: PLAN_ID,
      people: 1,
      bookingStatus: "PENDING",
    },
    update: {
      bookingStatus: "PENDING",
    },
  });
  console.log(`  ✓ Bookings: 3 筆（昨日完成 / 今日待確認 / 下週新預約）`);

  // ────────────────────────────────────────────────────────
  // 8. Transactions — 3 筆對應 wallet 購買 + 1 次扣堂
  //    TX-001: 顧客 A 買 10 堂套餐（PACKAGE_PURCHASE，3000 元）
  //    TX-002: 顧客 A 用掉 1 堂（SESSION_DEDUCTION，0 元，綁 booking-001）
  //    TX-003: 顧客 B 買 10 堂套餐（PACKAGE_PURCHASE，3000 元）
  // ────────────────────────────────────────────────────────
  await prisma.transaction.upsert({
    where: { id: TX_IDS[0] },
    create: {
      id: TX_IDS[0],
      customerId: CUSTOMER_IDS[0],
      storeId: STORE_ID,
      revenueStaffId: OWNER_STAFF_ID,
      soldByStaffId: OWNER_STAFF_ID,
      customerPlanWalletId: WALLET_IDS[0],
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "CASH",
      amount: 3000,
      note: "Staging 測試交易",
    },
    update: {
      amount: 3000,
    },
  });

  await prisma.transaction.upsert({
    where: { id: TX_IDS[1] },
    create: {
      id: TX_IDS[1],
      customerId: CUSTOMER_IDS[0],
      storeId: STORE_ID,
      bookingId: BOOKING_IDS[0],
      revenueStaffId: OWNER_STAFF_ID,
      customerPlanWalletId: WALLET_IDS[0],
      transactionType: "SESSION_DEDUCTION",
      paymentMethod: "CASH",
      amount: 0,
      quantity: 1,
      note: "扣 1 堂（綁 booking-001）",
    },
    update: {
      quantity: 1,
    },
  });

  await prisma.transaction.upsert({
    where: { id: TX_IDS[2] },
    create: {
      id: TX_IDS[2],
      customerId: CUSTOMER_IDS[1],
      storeId: STORE_ID,
      revenueStaffId: OWNER_STAFF_ID,
      soldByStaffId: OWNER_STAFF_ID,
      customerPlanWalletId: WALLET_IDS[1],
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "CASH",
      amount: 3000,
      note: "Staging 測試交易",
    },
    update: {
      amount: 3000,
    },
  });
  console.log(`  ✓ Transactions: 3 筆（2 筆購課 + 1 筆扣堂）`);

  // ────────────────────────────────────────────────────────
  // Cash Drawer 故意不 seed
  //
  //   不建立 CashDrawerSession / CashDrawerEntry，
  //   讓 Preview 從「尚未啟用現金抽屜」狀態開始，
  //   可完整測試：啟用 → 開店 → 提領/補入/調整 → 閉店 流程。
  // ────────────────────────────────────────────────────────

  console.log("");
  console.log("=== Seed completed ===");
  console.log("");
  console.log("【Steamfoot Preview / Staging 測試帳號】");
  console.log("");
  console.log(`測試店：${STORE_NAME} (slug=${STORE_SLUG})`);
  console.log("");
  console.log(`OWNER：${OWNER_EMAIL}  /  ${PASSWORD_PLAIN}`);
  console.log(`PARTNER：${PARTNER_EMAIL}  /  ${PASSWORD_PLAIN}`);
  console.log("");
  console.log("注意：只在 Preview / Staging 使用。");
  console.log("     正式站 https://www.steamfoot.com 仍使用正式店長帳號。");
}

main()
  .catch((e) => {
    console.error("Staging seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
