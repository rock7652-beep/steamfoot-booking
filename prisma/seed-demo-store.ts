/**
 * Demo 展示店 Seed — 蒸足 Demo 展示店
 * 用途：火力展示 / 對外成交展示
 * 執行：npx tsx prisma/seed-demo-store.ts
 *
 * 建立完整展示資料：
 * - 4 位員工（1 店長 + 3 教練）
 * - 80 位客戶（LEAD/TRIAL/ACTIVE/INACTIVE 分布）
 * - ~300 筆預約（過去 3 個月 + 未來 2 週）
 * - ~200 筆交易
 * - 排班資料
 * - 方案歷史 / 訂閱紀錄
 */

import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_STORE_ID = "demo-store";
const PASSWORD_HASH = hashSync("demo1234", 10);

// ============================================================
// 假資料工具
// ============================================================

const SURNAMES = [
  "王", "李", "張", "劉", "陳", "楊", "黃", "趙", "周", "吳",
  "徐", "孫", "馬", "朱", "胡", "郭", "何", "林", "羅", "高",
  "鄭", "梁", "謝", "宋", "唐", "許", "鄧", "韓", "曹", "馮",
];

const GIVEN_NAMES = [
  "美玲", "淑芬", "淑惠", "美惠", "雅婷", "麗華", "志明", "俊傑", "建宏", "志豪",
  "雅芳", "秀英", "秀華", "淑貞", "淑娟", "家豪", "信宏", "冠廷", "柏翰", "彥廷",
  "怡君", "佩珊", "雅慧", "惠雯", "靜宜", "宗翰", "承翰", "品睿", "宥廷", "宇翔",
  "詩涵", "筱婷", "雅琪", "心怡", "芷瑄", "明哲", "耀文", "家銘", "政憲", "冠宇",
];

function randomName(i: number): string {
  return SURNAMES[i % SURNAMES.length] + GIVEN_NAMES[i % GIVEN_NAMES.length];
}

function randomPhone(i: number): string {
  return `09${String(10000000 + i * 137 + 51).slice(0, 8)}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const SLOT_TIMES = ["10:00", "11:00", "14:00", "15:00", "16:00", "17:30", "18:30", "19:30"];

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("===== 建立 Demo 展示店 =====\n");

  // ----------------------------------------------------------
  // 1. Store + ShopConfig
  // ----------------------------------------------------------
  console.log("1. Store + ShopConfig ...");

  await prisma.store.upsert({
    where: { id: DEMO_STORE_ID },
    create: {
      id: DEMO_STORE_ID,
      name: "蒸足 Demo 展示店",
      slug: "demo",
      plan: "ALLIANCE",
      planStatus: "ACTIVE",
    },
    update: {
      name: "蒸足 Demo 展示店",
      plan: "ALLIANCE",
      planStatus: "ACTIVE",
    },
  });

  await prisma.shopConfig.upsert({
    where: { storeId: DEMO_STORE_ID },
    create: {
      storeId: DEMO_STORE_ID,
      shopName: "蒸足 Demo 展示店",
      plan: "PRO",
      dutySchedulingEnabled: true,
    },
    update: {
      shopName: "蒸足 Demo 展示店",
      plan: "PRO",
      dutySchedulingEnabled: true,
    },
  });

  console.log("  Store: 蒸足 Demo 展示店 (ALLIANCE + PRO)");

  // ----------------------------------------------------------
  // 2. Users + Staff
  // ----------------------------------------------------------
  console.log("\n2. Users + Staff ...");

  const staffData = [
    { email: "demo-owner@steamfoot.tw", name: "林美華 店長", display: "林美華 店長", color: "#6366f1", isOwner: true, role: "STORE_MANAGER" as const, phone: "0900000001" },
    { email: "demo-staff1@steamfoot.tw", name: "陳志明 教練", display: "陳志明 教練", color: "#f59e0b", isOwner: false, role: "COACH" as const, phone: "0900000002" },
    { email: "demo-staff2@steamfoot.tw", name: "張雅婷 教練", display: "張雅婷 教練", color: "#10b981", isOwner: false, role: "COACH" as const, phone: "0900000003" },
    { email: "demo-staff3@steamfoot.tw", name: "王俊傑 教練", display: "王俊傑 教練", color: "#ef4444", isOwner: false, role: "COACH" as const, phone: "0900000004" },
  ];

  const ALL_PERMISSIONS = [
    "customer.read", "customer.create", "customer.update", "customer.assign", "customer.export",
    "booking.read", "booking.create", "booking.update",
    "transaction.read", "transaction.create",
    "wallet.read", "wallet.create",
    "report.read", "report.export",
    "cashbook.read", "cashbook.create",
    "plans.edit",
    "business_hours.view", "business_hours.manage",
    "staff.view",
    "duty.read", "duty.manage",
  ];

  const staffRecords: Array<{ id: string; userId: string }> = [];

  for (const s of staffData) {
    // Upsert user
    const user = await prisma.user.upsert({
      where: { email: s.email },
      create: {
        name: s.name,
        email: s.email,
        phone: s.phone,
        passwordHash: PASSWORD_HASH,
        role: s.role,
      },
      update: { name: s.name, role: s.role },
    });

    // Upsert staff
    let staff = await prisma.staff.findUnique({ where: { userId: user.id } });
    if (!staff) {
      staff = await prisma.staff.create({
        data: {
          userId: user.id,
          storeId: DEMO_STORE_ID,
          displayName: s.display,
          colorCode: s.color,
          isOwner: s.isOwner,
          monthlySpaceFee: s.isOwner ? 0 : 15000,
          spaceFeeEnabled: !s.isOwner,
        },
      });
    }

    // Permissions — grant all
    for (const perm of ALL_PERMISSIONS) {
      await prisma.staffPermission.upsert({
        where: { staffId_permission: { staffId: staff.id, permission: perm } },
        create: { staffId: staff.id, permission: perm, granted: true },
        update: { granted: true },
      });
    }

    staffRecords.push({ id: staff.id, userId: user.id });
    console.log(`  Staff: ${s.display} (${s.email})`);
  }

  // ----------------------------------------------------------
  // 3. Service Plans（全域，確保存在）
  // ----------------------------------------------------------
  console.log("\n3. Service Plans ...");

  const planDefs = [
    { name: "體驗", category: "TRIAL" as const, price: 500, sessions: 1, validity: 30, sort: 0 },
    { name: "單次", category: "SINGLE" as const, price: 800, sessions: 1, validity: null, sort: 1 },
    { name: "3堂套餐", category: "PACKAGE" as const, price: 2100, sessions: 3, validity: 60, sort: 2 },
    { name: "5堂套餐", category: "PACKAGE" as const, price: 3250, sessions: 5, validity: 90, sort: 3 },
    { name: "10堂套餐", category: "PACKAGE" as const, price: 6000, sessions: 10, validity: 180, sort: 4 },
    { name: "22堂套餐", category: "PACKAGE" as const, price: 11000, sessions: 22, validity: 365, sort: 5 },
  ];

  const plans: Record<string, { id: string; price: number; sessions: number; validity: number | null }> = {};

  for (const p of planDefs) {
    const existing = await prisma.servicePlan.findFirst({ where: { name: p.name } });
    if (existing) {
      plans[p.name] = { id: existing.id, price: p.price, sessions: p.sessions, validity: p.validity };
    } else {
      const created = await prisma.servicePlan.create({
        data: {
          name: p.name,
          category: p.category,
          price: p.price,
          sessionCount: p.sessions,
          validityDays: p.validity,
          sortOrder: p.sort,
          isActive: true,
        },
      });
      plans[p.name] = { id: created.id, price: p.price, sessions: p.sessions, validity: p.validity };
    }
  }
  console.log(`  ${Object.keys(plans).length} plans ready`);

  // ----------------------------------------------------------
  // 4. Customers（80 筆）
  // ----------------------------------------------------------
  console.log("\n4. Customers (80) ...");

  // Distribution: ACTIVE=40, TRIAL=15, LEAD=15, INACTIVE=10
  type StageType = "LEAD" | "TRIAL" | "ACTIVE" | "INACTIVE";
  const stageDistribution: StageType[] = [
    ...Array(40).fill("ACTIVE" as StageType),
    ...Array(15).fill("TRIAL" as StageType),
    ...Array(15).fill("LEAD" as StageType),
    ...Array(10).fill("INACTIVE" as StageType),
  ];

  const customers: Array<{ id: string; stage: StageType; staffId: string }> = [];

  for (let i = 0; i < 80; i++) {
    const stage = stageDistribution[i];
    const assignedStaff = staffRecords[i % staffRecords.length];
    const phone = randomPhone(i + 200); // offset to avoid conflicts

    const firstVisit = stage === "LEAD" ? null : daysAgo(Math.floor(Math.random() * 90) + 10);
    const converted = stage === "ACTIVE" || stage === "INACTIVE"
      ? (firstVisit ? new Date(firstVisit.getTime() + 7 * 86400000) : null)
      : null;
    const lastVisit = stage === "ACTIVE"
      ? daysAgo(Math.floor(Math.random() * 14))
      : stage === "INACTIVE"
        ? daysAgo(Math.floor(Math.random() * 60) + 30)
        : firstVisit;

    const customer = await prisma.customer.create({
      data: {
        storeId: DEMO_STORE_ID,
        name: randomName(i),
        phone,
        assignedStaffId: assignedStaff.id,
        customerStage: stage,
        selfBookingEnabled: stage === "ACTIVE",
        firstVisitAt: firstVisit,
        convertedAt: converted,
        lastVisitAt: lastVisit,
        notes: stage === "ACTIVE" ? "固定回訪客戶" : undefined,
      },
    });

    customers.push({ id: customer.id, stage, staffId: assignedStaff.id });
  }

  console.log(`  Created: ${customers.length} customers`);
  console.log(`    ACTIVE: ${customers.filter(c => c.stage === "ACTIVE").length}`);
  console.log(`    TRIAL:  ${customers.filter(c => c.stage === "TRIAL").length}`);
  console.log(`    LEAD:   ${customers.filter(c => c.stage === "LEAD").length}`);
  console.log(`    INACTIVE: ${customers.filter(c => c.stage === "INACTIVE").length}`);

  // ----------------------------------------------------------
  // 5. CustomerPlanWallets（~50 筆）
  // ----------------------------------------------------------
  console.log("\n5. CustomerPlanWallets ...");

  const activeCustomers = customers.filter(c => c.stage === "ACTIVE");
  const inactiveCustomers = customers.filter(c => c.stage === "INACTIVE");

  const wallets: Array<{ id: string; customerId: string; planName: string; remaining: number }> = [];

  // Active customers get active wallets
  const packagePlans = ["3堂套餐", "5堂套餐", "10堂套餐", "22堂套餐"];
  for (let i = 0; i < activeCustomers.length; i++) {
    const c = activeCustomers[i];
    const planName = packagePlans[i % packagePlans.length];
    const plan = plans[planName];
    const used = Math.floor(Math.random() * (plan.sessions - 1)) + 1;
    const remaining = plan.sessions - used;
    const startDate = daysAgo(Math.floor(Math.random() * 60) + 10);
    const expiryDate = plan.validity
      ? new Date(startDate.getTime() + plan.validity * 86400000)
      : null;

    const wallet = await prisma.customerPlanWallet.create({
      data: {
        customerId: c.id,
        storeId: DEMO_STORE_ID,
        planId: plan.id,
        purchasedPrice: plan.price,
        totalSessions: plan.sessions,
        remainingSessions: remaining,
        startDate,
        expiryDate,
        status: "ACTIVE",
      },
    });

    wallets.push({ id: wallet.id, customerId: c.id, planName, remaining });
  }

  // Inactive customers get used-up wallets
  for (const c of inactiveCustomers) {
    const planName = randomPick(packagePlans);
    const plan = plans[planName];
    const startDate = daysAgo(120);

    await prisma.customerPlanWallet.create({
      data: {
        customerId: c.id,
        storeId: DEMO_STORE_ID,
        planId: plan.id,
        purchasedPrice: plan.price,
        totalSessions: plan.sessions,
        remainingSessions: 0,
        startDate,
        expiryDate: daysAgo(30),
        status: "USED_UP",
      },
    });
  }

  console.log(`  Active wallets: ${wallets.length}`);
  console.log(`  Used-up wallets: ${inactiveCustomers.length}`);

  // ----------------------------------------------------------
  // 6. Bookings + Transactions（~300 預約 + ~200 交易）
  // ----------------------------------------------------------
  console.log("\n6. Bookings + Transactions ...");

  let bookingCount = 0;
  let transactionCount = 0;

  // Past 90 days: completed bookings
  for (let dayOffset = 90; dayOffset >= 1; dayOffset--) {
    const date = daysAgo(dayOffset);
    const dayOfWeek = date.getDay();

    // Skip some Mondays (rest day)
    if (dayOfWeek === 1 && dayOffset % 3 !== 0) continue;

    // Determine slots for this day (busier on weekends)
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const slotsToFill = isWeekend
      ? SLOT_TIMES.slice(0, 7) // 7 slots on weekends
      : SLOT_TIMES.slice(0, Math.floor(Math.random() * 3) + 4); // 4-6 slots weekdays

    for (const slot of slotsToFill) {
      // 1-3 bookings per slot
      const bookingsInSlot = isWeekend
        ? Math.floor(Math.random() * 2) + 2
        : Math.floor(Math.random() * 2) + 1;

      for (let b = 0; b < bookingsInSlot; b++) {
        // Pick a customer with active/inactive stage
        const eligibleCustomers = customers.filter(c => c.stage === "ACTIVE" || c.stage === "INACTIVE" || c.stage === "TRIAL");
        const customer = randomPick(eligibleCustomers);
        const staff = staffRecords[bookingCount % staffRecords.length];

        // Status distribution
        let status: "COMPLETED" | "CANCELLED" | "NO_SHOW";
        const roll = Math.random();
        if (roll < 0.82) status = "COMPLETED";
        else if (roll < 0.92) status = "CANCELLED";
        else status = "NO_SHOW";

        const wallet = wallets.find(w => w.customerId === customer.id);
        const bookingType = wallet ? "PACKAGE_SESSION" as const : (customer.stage === "TRIAL" ? "FIRST_TRIAL" as const : "SINGLE" as const);

        const booking = await prisma.booking.create({
          data: {
            storeId: DEMO_STORE_ID,
            customerId: customer.id,
            bookingDate: date,
            slotTime: slot,
            revenueStaffId: customer.staffId,
            serviceStaffId: staff.id,
            bookedByType: Math.random() > 0.4 ? "STAFF" : "CUSTOMER",
            bookedByStaffId: Math.random() > 0.4 ? staff.id : null,
            bookingType,
            servicePlanId: wallet ? plans[wallet.planName].id : (bookingType === "FIRST_TRIAL" ? plans["體驗"].id : plans["單次"].id),
            customerPlanWalletId: wallet?.id ?? null,
            bookingStatus: status,
            people: 1,
          },
        });

        bookingCount++;

        // Create transaction for completed bookings
        if (status === "COMPLETED") {
          const txType = bookingType === "FIRST_TRIAL" ? "TRIAL_PURCHASE" as const
            : bookingType === "PACKAGE_SESSION" ? "SESSION_DEDUCTION" as const
            : "SINGLE_PURCHASE" as const;

          const amount = txType === "TRIAL_PURCHASE" ? 500
            : txType === "SINGLE_PURCHASE" ? 800
            : 0; // session deduction = 0 amount

          await prisma.transaction.create({
            data: {
              storeId: DEMO_STORE_ID,
              customerId: customer.id,
              bookingId: booking.id,
              revenueStaffId: customer.staffId,
              serviceStaffId: staff.id,
              soldByStaffId: staff.id,
              customerPlanWalletId: wallet?.id ?? null,
              transactionType: txType,
              paymentMethod: txType === "SESSION_DEDUCTION" ? "UNPAID" : randomPick(["CASH", "TRANSFER", "LINE_PAY"] as const),
              amount: amount,
              quantity: txType === "SESSION_DEDUCTION" ? 1 : null,
              createdAt: date,
            },
          });
          transactionCount++;
        }
      }
    }
  }

  // Future 14 days: confirmed bookings
  for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
    const date = daysFromNow(dayOffset);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 1) continue; // Monday rest

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const slotsToFill = isWeekend
      ? SLOT_TIMES.slice(0, 6)
      : SLOT_TIMES.slice(0, Math.floor(Math.random() * 2) + 3);

    for (const slot of slotsToFill) {
      const bookingsInSlot = Math.floor(Math.random() * 2) + 1;

      for (let b = 0; b < bookingsInSlot; b++) {
        const activeOnly = customers.filter(c => c.stage === "ACTIVE");
        const customer = randomPick(activeOnly);
        const staff = staffRecords[bookingCount % staffRecords.length];
        const wallet = wallets.find(w => w.customerId === customer.id);

        await prisma.booking.create({
          data: {
            storeId: DEMO_STORE_ID,
            customerId: customer.id,
            bookingDate: date,
            slotTime: slot,
            revenueStaffId: customer.staffId,
            serviceStaffId: staff.id,
            bookedByType: "STAFF",
            bookedByStaffId: staff.id,
            bookingType: wallet ? "PACKAGE_SESSION" : "SINGLE",
            servicePlanId: wallet ? plans[wallet.planName].id : plans["單次"].id,
            customerPlanWalletId: wallet?.id ?? null,
            bookingStatus: "CONFIRMED",
            people: 1,
          },
        });
        bookingCount++;
      }
    }
  }

  // Package purchase transactions (separate from bookings)
  for (let i = 0; i < 30; i++) {
    const customer = randomPick(activeCustomers);
    const planName = randomPick(packagePlans);
    const plan = plans[planName];
    const staff = staffRecords[i % staffRecords.length];
    const purchaseDate = daysAgo(Math.floor(Math.random() * 80) + 5);

    await prisma.transaction.create({
      data: {
        storeId: DEMO_STORE_ID,
        customerId: customer.id,
        revenueStaffId: customer.staffId,
        serviceStaffId: staff.id,
        soldByStaffId: staff.id,
        transactionType: "PACKAGE_PURCHASE",
        paymentMethod: randomPick(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD"] as const),
        amount: plan.price,
        note: `購買${planName}`,
        createdAt: purchaseDate,
      },
    });
    transactionCount++;
  }

  console.log(`  Bookings: ${bookingCount}`);
  console.log(`  Transactions: ${transactionCount}`);

  // ----------------------------------------------------------
  // 7. DutyAssignments（排班）
  // ----------------------------------------------------------
  console.log("\n7. DutyAssignments ...");

  let dutyCount = 0;

  // Past 30 days + future 14 days
  for (let dayOffset = -30; dayOffset <= 14; dayOffset++) {
    const date = dayOffset < 0 ? daysAgo(-dayOffset) : daysFromNow(dayOffset);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 1) continue; // Monday rest

    // 2-3 staff per day
    const onDutyCount = dayOfWeek === 0 || dayOfWeek === 6 ? 3 : 2;
    const shuffled = [...staffRecords].sort(() => Math.random() - 0.5);
    const onDuty = shuffled.slice(0, onDutyCount);

    const daySlots = ["10:00", "14:00", "17:30"];

    for (const staff of onDuty) {
      for (const slot of daySlots) {
        const isOwner = staff.id === staffRecords[0].id;
        try {
          await prisma.dutyAssignment.create({
            data: {
              storeId: DEMO_STORE_ID,
              date,
              slotTime: slot,
              staffId: staff.id,
              dutyRole: isOwner ? "STORE_MANAGER" : "BRANCH_MANAGER",
              participationType: "PRIMARY",
              createdByStaffId: staffRecords[0].id,
            },
          });
          dutyCount++;
        } catch {
          // Skip unique constraint violations
        }
      }
    }
  }

  console.log(`  DutyAssignments: ${dutyCount}`);

  // ----------------------------------------------------------
  // 8. StorePlanChange（方案異動歷史）
  // ----------------------------------------------------------
  console.log("\n8. StorePlanChange (upgrade history) ...");

  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const operatorId = adminUser?.id ?? staffRecords[0].userId;

  const planHistory: Array<{
    changeType: "TRIAL_STARTED" | "UPGRADE_APPROVED" | "PLAN_ACTIVATED" | "PAYMENT_CONFIRMED";
    fromPlan: "EXPERIENCE" | "BASIC" | "GROWTH" | "ALLIANCE" | null;
    toPlan: "EXPERIENCE" | "BASIC" | "GROWTH" | "ALLIANCE";
    fromStatus: "TRIAL" | "ACTIVE" | "PAYMENT_PENDING" | null;
    toStatus: "TRIAL" | "ACTIVE" | "PAYMENT_PENDING";
    daysAgo: number;
    reason: string;
  }> = [
    { changeType: "TRIAL_STARTED", fromPlan: null, toPlan: "EXPERIENCE", fromStatus: null, toStatus: "TRIAL", daysAgo: 180, reason: "新店試用開通" },
    { changeType: "UPGRADE_APPROVED", fromPlan: "EXPERIENCE", toPlan: "BASIC", fromStatus: "TRIAL", toStatus: "PAYMENT_PENDING", daysAgo: 166, reason: "試用期結束，升級基礎方案" },
    { changeType: "PAYMENT_CONFIRMED", fromPlan: "BASIC", toPlan: "BASIC", fromStatus: "PAYMENT_PENDING", toStatus: "ACTIVE", daysAgo: 165, reason: "付款確認" },
    { changeType: "UPGRADE_APPROVED", fromPlan: "BASIC", toPlan: "GROWTH", fromStatus: "ACTIVE", toStatus: "PAYMENT_PENDING", daysAgo: 90, reason: "業績成長，升級成長版" },
    { changeType: "PAYMENT_CONFIRMED", fromPlan: "GROWTH", toPlan: "GROWTH", fromStatus: "PAYMENT_PENDING", toStatus: "ACTIVE", daysAgo: 89, reason: "付款確認" },
    { changeType: "UPGRADE_APPROVED", fromPlan: "GROWTH", toPlan: "ALLIANCE", fromStatus: "ACTIVE", toStatus: "PAYMENT_PENDING", daysAgo: 30, reason: "展店需求，升級聯盟方案" },
    { changeType: "PAYMENT_CONFIRMED", fromPlan: "ALLIANCE", toPlan: "ALLIANCE", fromStatus: "PAYMENT_PENDING", toStatus: "ACTIVE", daysAgo: 29, reason: "付款確認" },
  ];

  for (const h of planHistory) {
    await prisma.storePlanChange.create({
      data: {
        storeId: DEMO_STORE_ID,
        changeType: h.changeType,
        fromPlan: h.fromPlan,
        toPlan: h.toPlan,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        operatorUserId: operatorId,
        reason: h.reason,
        createdAt: daysAgo(h.daysAgo),
      },
    });
  }

  console.log(`  Plan changes: ${planHistory.length}`);

  // ----------------------------------------------------------
  // 9. UpgradeRequests（申請歷史）
  // ----------------------------------------------------------
  console.log("\n9. UpgradeRequests ...");

  const upgradeRequests = [
    { current: "EXPERIENCE" as const, requested: "BASIC" as const, type: "UPGRADE" as const, daysAgo: 167, status: "APPROVED" as const },
    { current: "BASIC" as const, requested: "GROWTH" as const, type: "UPGRADE" as const, daysAgo: 91, status: "APPROVED" as const },
    { current: "GROWTH" as const, requested: "ALLIANCE" as const, type: "UPGRADE" as const, daysAgo: 31, status: "APPROVED" as const },
  ];

  for (const req of upgradeRequests) {
    await prisma.upgradeRequest.create({
      data: {
        storeId: DEMO_STORE_ID,
        currentPlan: req.current,
        requestedPlan: req.requested,
        requestType: req.type,
        reason: `營運需求升級至${req.requested}`,
        status: req.status,
        requestedBy: staffRecords[0].userId,
        reviewedBy: operatorId,
        reviewedAt: daysAgo(req.daysAgo - 1),
        reviewNote: "核准升級",
        source: "SETTINGS",
        billingStatus: "PAID",
        effectiveAt: daysAgo(req.daysAgo - 1),
        createdAt: daysAgo(req.daysAgo),
      },
    });
  }

  console.log(`  UpgradeRequests: ${upgradeRequests.length}`);

  // ----------------------------------------------------------
  // 10. StoreSubscription（訂閱紀錄）
  // ----------------------------------------------------------
  console.log("\n10. StoreSubscription ...");

  const subscription = await prisma.storeSubscription.create({
    data: {
      storeId: DEMO_STORE_ID,
      plan: "ALLIANCE",
      status: "ACTIVE",
      startedAt: daysAgo(29),
      effectiveAt: daysAgo(29),
      billingCycle: "MONTHLY",
      billingStatus: "PAID",
      priceAmount: 4990,
      priceCurrency: "TWD",
      createdBy: operatorId,
      note: "聯盟方案月繳",
    },
  });

  // Link subscription to store
  await prisma.store.update({
    where: { id: DEMO_STORE_ID },
    data: { currentSubscriptionId: subscription.id },
  });

  console.log(`  Subscription: ALLIANCE (ACTIVE)`);

  // ----------------------------------------------------------
  // Done
  // ----------------------------------------------------------
  console.log("\n===== Demo 展示店建立完成 =====");
  console.log("\nLogin accounts (password: demo1234):");
  console.log("  店長: demo-owner@steamfoot.tw");
  console.log("  教練: demo-staff1@steamfoot.tw");
  console.log("  教練: demo-staff2@steamfoot.tw");
  console.log("  教練: demo-staff3@steamfoot.tw");
  console.log("\n統計:");
  console.log(`  客戶: ${customers.length} 筆`);
  console.log(`  預約: ${bookingCount} 筆`);
  console.log(`  交易: ${transactionCount} 筆`);
  console.log(`  排班: ${dutyCount} 筆`);
  console.log(`  方案異動: ${planHistory.length} 筆`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
