import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ============================================================
  // 0. 清理既有 seed 資料（讓 seed 可重複執行）
  //    使用 TRUNCATE CASCADE 一次清除所有資料表
  //    ⚠️ 僅限 dev 環境使用
  // ============================================================

  // 🛡️ Production 安全護欄 — 禁止在正式環境執行全量 seed
  // 必須設定 ALLOW_SEED_RESET=1 才能執行（防止誤跑）
  if (process.env.ALLOW_SEED_RESET !== "1") {
    console.error("🚫 seed.ts 會 TRUNCATE 所有資料，預設禁止執行");
    console.error("   若確定要重建全部資料，請使用：");
    console.error("   ALLOW_SEED_RESET=1 npm run seed");
    console.error("");
    console.error("   若只要補建展示資料（不清除現有資料），請用：");
    console.error("   npm run seed:production-demo  → 安全重建 100 位 Demo 顧客");
    console.error("   npm run seed:demo             → Demo 展示店");
    process.exit(1);
  }

  console.log("Cleaning up existing seed data...");

  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== "_prisma_migrations")
    .map((name) => `"${name}"`)
    .join(", ");

  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);
  }

  // 重新插入 default store（被 TRUNCATE 清掉了）
  // 後面 Section 8 的 upsert 會補齊完整資料
  await prisma.store.create({
    data: {
      id: "default-store",
      name: "暖暖蒸足",
      slug: "zhubei",
      isDefault: true,
    },
  });

  console.log("Cleanup done. Creating seed data...");

  // ============================================================
  // 1. Users + Staff
  // ============================================================

  const passwordHash = hashSync("test1234", 10);

  // A 店長（Owner）
  const ownerUser = await prisma.user.create({
    data: {
      name: "Alice 店主",
      email: "alice@steamfoot.tw",
      phone: "0912345678",
      passwordHash,
      role: "ADMIN",
      staff: {
        create: {
          storeId: "default-store",
          displayName: "Alice 店主",
          colorCode: "#6366f1",
          isOwner: true,
          monthlySpaceFee: 0,
          spaceFeeEnabled: false,
        },
      },
    },
    include: { staff: true },
  });

  // B 店長（Manager）
  const managerBUser = await prisma.user.create({
    data: {
      name: "Bob 店長",
      email: "bob@steamfoot.tw",
      phone: "0923456789",
      passwordHash,
      role: "OWNER",
      staff: {
        create: {
          storeId: "default-store",
          displayName: "Bob 店長",
          colorCode: "#f59e0b",
          isOwner: false,
          monthlySpaceFee: 15000,
          spaceFeeEnabled: true,
        },
      },
    },
    include: { staff: true },
  });

  // C 店長（Manager）
  const managerCUser = await prisma.user.create({
    data: {
      name: "Carol 店長",
      email: "carol@steamfoot.tw",
      phone: "0934567890",
      passwordHash,
      role: "OWNER",
      staff: {
        create: {
          storeId: "default-store",
          displayName: "Carol 店長",
          colorCode: "#10b981",
          isOwner: false,
          monthlySpaceFee: 15000,
          spaceFeeEnabled: true,
        },
      },
    },
    include: { staff: true },
  });

  const ownerStaff = ownerUser.staff!;
  const managerBStaff = managerBUser.staff!;
  const managerCStaff = managerCUser.staff!;

  console.log("  Staff created:", ownerStaff.displayName, managerBStaff.displayName, managerCStaff.displayName);

  // ============================================================
  // 1b. Staff Permissions (RBAC)
  // ============================================================

  // Bob: 大部分權限（模擬「部分權限 Manager」）
  const bobPermissions = [
    "customer.read", "customer.create", "customer.update",
    "booking.read", "booking.create", "booking.update",
    "transaction.read", "transaction.create",
    "wallet.read", "wallet.create",
    "report.read",
  ];
  // Carol: 極少權限（模擬「極少權限 Manager」）
  const carolPermissions = [
    "customer.read",
    "booking.read", "booking.create",
  ];

  const allPermCodes = [
    "customer.read", "customer.create", "customer.update", "customer.assign", "customer.export",
    "booking.read", "booking.create", "booking.update",
    "transaction.read", "transaction.create",
    "wallet.read", "wallet.create",
    "report.read", "report.export",
    "cashbook.read", "cashbook.create",
  ];

  await prisma.staffPermission.createMany({
    data: allPermCodes.map((perm) => ({
      staffId: managerBStaff.id,
      permission: perm,
      granted: bobPermissions.includes(perm),
    })),
    skipDuplicates: true,
  });

  await prisma.staffPermission.createMany({
    data: allPermCodes.map((perm) => ({
      staffId: managerCStaff.id,
      permission: perm,
      granted: carolPermissions.includes(perm),
    })),
    skipDuplicates: true,
  });

  console.log("  Permissions: Bob=", bobPermissions.length, "granted, Carol=", carolPermissions.length, "granted");

  // ============================================================
  // 2. Service Plans
  // ============================================================

  const plans = await Promise.all([
    prisma.servicePlan.create({
      data: {
        storeId: "default-store",
        name: "體驗",
        category: "TRIAL",
        price: 500,
        sessionCount: 1,
        validityDays: 30,
        sortOrder: 1,
        description: "首次體驗價",
      },
    }),
    prisma.servicePlan.create({
      data: {
        storeId: "default-store",
        name: "單次",
        category: "SINGLE",
        price: 800,
        sessionCount: 1,
        validityDays: null,
        sortOrder: 2,
        description: "單次蒸足",
      },
    }),
    prisma.servicePlan.create({
      data: {
        storeId: "default-store",
        name: "3堂套餐",
        category: "PACKAGE",
        price: 2100,
        sessionCount: 3,
        validityDays: 60,
        sortOrder: 3,
        description: "3堂套餐，平均每堂700元",
      },
    }),
    prisma.servicePlan.create({
      data: {
        storeId: "default-store",
        name: "5堂套餐",
        category: "PACKAGE",
        price: 3250,
        sessionCount: 5,
        validityDays: 90,
        sortOrder: 4,
        description: "5堂套餐，平均每堂650元",
      },
    }),
    prisma.servicePlan.create({
      data: {
        storeId: "default-store",
        name: "10堂套餐",
        category: "PACKAGE",
        price: 6000,
        sessionCount: 10,
        validityDays: 180,
        sortOrder: 5,
        description: "10堂套餐，平均每堂600元",
      },
    }),
    prisma.servicePlan.create({
      data: {
        storeId: "default-store",
        name: "22堂套餐",
        category: "PACKAGE",
        price: 11000,
        sessionCount: 22,
        validityDays: 365,
        sortOrder: 6,
        description: "22堂套餐，平均每堂500元",
      },
    }),
  ]);

  console.log("  Service plans created:", plans.length);

  // ============================================================
  // 3. Booking Slots（8 個固定時段，每天都啟用）
  // ============================================================

  const slotTimes = ["10:00", "11:00", "14:00", "15:00", "16:00", "17:30", "18:30", "19:30"];
  const daysOfWeek = [0, 1, 2, 3, 4, 5, 6]; // Sunday to Saturday

  for (const day of daysOfWeek) {
    for (const time of slotTimes) {
      await prisma.bookingSlot.create({
        data: {
          storeId: "default-store",
          dayOfWeek: day,
          startTime: time,
          capacity: 6,
          isEnabled: true,
        },
      });
    }
  }

  console.log("  Booking slots created:", slotTimes.length, "slots x", daysOfWeek.length, "days");

  // ============================================================
  // 4. Customers（不同 stage）
  // ============================================================

  // Alice 名下顧客
  const customerActive1 = await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "王小明",
      phone: "0911111111",
      lineName: "小明LINE",
      assignedStaffId: ownerStaff.id,
      customerStage: "ACTIVE",
      selfBookingEnabled: true,
      firstVisitAt: new Date("2025-12-01"),
      convertedAt: new Date("2025-12-15"),
    },
  });

  const customerActive2 = await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "李小華",
      phone: "0911222222",
      assignedStaffId: ownerStaff.id,
      customerStage: "ACTIVE",
      selfBookingEnabled: true,
      firstVisitAt: new Date("2026-01-10"),
      convertedAt: new Date("2026-01-20"),
    },
  });

  const customerTrial1 = await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "張美玲",
      phone: "0911333333",
      assignedStaffId: ownerStaff.id,
      customerStage: "TRIAL",
      selfBookingEnabled: false,
      firstVisitAt: new Date("2026-03-15"),
    },
  });

  // Bob 名下顧客
  const customerActive3 = await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "陳大偉",
      phone: "0922111111",
      lineName: "大偉",
      assignedStaffId: managerBStaff.id,
      customerStage: "ACTIVE",
      selfBookingEnabled: true,
      firstVisitAt: new Date("2026-01-05"),
      convertedAt: new Date("2026-01-15"),
    },
  });

  await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "林志強",
      phone: "0922222222",
      assignedStaffId: managerBStaff.id,
      customerStage: "LEAD",
      selfBookingEnabled: false,
    },
  });

  const customerInactive1 = await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "周美美",
      phone: "0922333333",
      assignedStaffId: managerBStaff.id,
      customerStage: "INACTIVE",
      selfBookingEnabled: false,
      firstVisitAt: new Date("2025-06-01"),
      convertedAt: new Date("2025-06-15"),
    },
  });

  // Carol 名下顧客
  const customerActive4 = await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "吳家豪",
      phone: "0933111111",
      lineName: "家豪JH",
      assignedStaffId: managerCStaff.id,
      customerStage: "ACTIVE",
      selfBookingEnabled: true,
      firstVisitAt: new Date("2026-02-01"),
      convertedAt: new Date("2026-02-10"),
    },
  });

  await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "黃雅琪",
      phone: "0933222222",
      assignedStaffId: managerCStaff.id,
      customerStage: "TRIAL",
      selfBookingEnabled: false,
      firstVisitAt: new Date("2026-03-20"),
    },
  });

  await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "鄭小花",
      phone: "0933333333",
      assignedStaffId: managerCStaff.id,
      customerStage: "LEAD",
      selfBookingEnabled: false,
    },
  });

  const customerActive5 = await prisma.customer.create({
    data: {
      storeId: "default-store",
      name: "劉心怡",
      phone: "0933444444",
      assignedStaffId: managerCStaff.id,
      customerStage: "ACTIVE",
      selfBookingEnabled: true,
      firstVisitAt: new Date("2025-11-01"),
      convertedAt: new Date("2025-11-15"),
    },
  });

  console.log("  Customers created: 10");

  // ============================================================
  // 5. Wallets（ACTIVE 顧客的課程錢包）
  // ============================================================

  const plan10 = plans[4]; // 10堂套餐
  const plan5 = plans[3];  // 5堂套餐
  const plan3 = plans[2];  // 3堂套餐
  const planTrial = plans[0]; // 體驗

  // 王小明：10堂套餐，已用3堂
  const wallet1 = await prisma.customerPlanWallet.create({
    data: {
      storeId: "default-store",
      customerId: customerActive1.id,
      planId: plan10.id,
      purchasedPrice: 6000,
      totalSessions: 10,
      remainingSessions: 7,
      startDate: new Date("2025-12-15"),
      expiryDate: new Date("2026-06-13"),
      status: "ACTIVE",
    },
  });

  // 李小華：5堂套餐，已用1堂
  const wallet2 = await prisma.customerPlanWallet.create({
    data: {
      storeId: "default-store",
      customerId: customerActive2.id,
      planId: plan5.id,
      purchasedPrice: 3250,
      totalSessions: 5,
      remainingSessions: 4,
      startDate: new Date("2026-01-20"),
      expiryDate: new Date("2026-04-20"),
      status: "ACTIVE",
    },
  });

  // 陳大偉：3堂套餐，已用1堂
  const wallet3 = await prisma.customerPlanWallet.create({
    data: {
      storeId: "default-store",
      customerId: customerActive3.id,
      planId: plan3.id,
      purchasedPrice: 2100,
      totalSessions: 3,
      remainingSessions: 2,
      startDate: new Date("2026-01-15"),
      expiryDate: new Date("2026-03-16"),
      status: "ACTIVE",
    },
  });

  // 吳家豪：10堂套餐，全新
  const wallet4 = await prisma.customerPlanWallet.create({
    data: {
      storeId: "default-store",
      customerId: customerActive4.id,
      planId: plan10.id,
      purchasedPrice: 6000,
      totalSessions: 10,
      remainingSessions: 10,
      startDate: new Date("2026-02-10"),
      expiryDate: new Date("2026-08-09"),
      status: "ACTIVE",
    },
  });

  // 劉心怡：5堂套餐，已用3堂
  const wallet5 = await prisma.customerPlanWallet.create({
    data: {
      storeId: "default-store",
      customerId: customerActive5.id,
      planId: plan5.id,
      purchasedPrice: 3250,
      totalSessions: 5,
      remainingSessions: 2,
      startDate: new Date("2025-11-15"),
      expiryDate: new Date("2026-02-13"),
      status: "ACTIVE",
    },
  });

  // 周美美：舊的3堂已用完
  await prisma.customerPlanWallet.create({
    data: {
      storeId: "default-store",
      customerId: customerInactive1.id,
      planId: plan3.id,
      purchasedPrice: 2100,
      totalSessions: 3,
      remainingSessions: 0,
      startDate: new Date("2025-06-15"),
      expiryDate: new Date("2025-08-14"),
      status: "USED_UP",
    },
  });

  console.log("  Wallets created: 6");

  // ============================================================
  // 6. Sample Transactions（購課交易）
  // ============================================================

  // 王小明購買10堂
  await prisma.transaction.create({
    data: {
      storeId: "default-store",
      customerId: customerActive1.id,
      revenueStaffId: ownerStaff.id,
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "CASH",
      amount: 6000,
      customerPlanWalletId: wallet1.id,
      note: "購買10堂套餐",
    },
  });

  // 李小華購買5堂
  await prisma.transaction.create({
    data: {
      storeId: "default-store",
      customerId: customerActive2.id,
      revenueStaffId: ownerStaff.id,
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "TRANSFER",
      amount: 3250,
      customerPlanWalletId: wallet2.id,
      note: "購買5堂套餐",
    },
  });

  // 陳大偉購買3堂（Bob名下）
  await prisma.transaction.create({
    data: {
      storeId: "default-store",
      customerId: customerActive3.id,
      revenueStaffId: managerBStaff.id,
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "CASH",
      amount: 2100,
      customerPlanWalletId: wallet3.id,
      note: "購買3堂套餐",
    },
  });

  // 吳家豪購買10堂（Carol名下）
  await prisma.transaction.create({
    data: {
      storeId: "default-store",
      customerId: customerActive4.id,
      revenueStaffId: managerCStaff.id,
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "CASH",
      amount: 6000,
      customerPlanWalletId: wallet4.id,
      note: "購買10堂套餐",
    },
  });

  // 劉心怡購買5堂（Carol名下）
  await prisma.transaction.create({
    data: {
      storeId: "default-store",
      customerId: customerActive5.id,
      revenueStaffId: managerCStaff.id,
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "TRANSFER",
      amount: 3250,
      customerPlanWalletId: wallet5.id,
      note: "購買5堂套餐",
    },
  });

  // 張美玲體驗（Alice名下）
  await prisma.transaction.create({
    data: {
      storeId: "default-store",
      customerId: customerTrial1.id,
      revenueStaffId: ownerStaff.id,
      transactionType: "TRIAL_PURCHASE",
      paymentMethod: "CASH",
      amount: 500,
      note: "首次體驗",
    },
  });

  console.log("  Transactions created: 6");

  // ============================================================
  // 7. Sample Bookings
  // ============================================================

  // 王小明已完成3次
  for (let i = 0; i < 3; i++) {
    const date = new Date(`2026-01-${10 + i * 7}`);
    await prisma.booking.create({
      data: {
        storeId: "default-store",
        customerId: customerActive1.id,
        bookingDate: date,
        slotTime: "14:00",
        revenueStaffId: ownerStaff.id,
        serviceStaffId: ownerStaff.id,
        bookedByType: "STAFF",
        bookedByStaffId: ownerStaff.id,
        bookingType: "PACKAGE_SESSION",
        servicePlanId: plan10.id,
        customerPlanWalletId: wallet1.id,
        bookingStatus: "COMPLETED",
        notes: `第${i + 1}次蒸足`,
      },
    });
  }

  // 李小華已完成1次
  await prisma.booking.create({
    data: {
      storeId: "default-store",
      customerId: customerActive2.id,
      bookingDate: new Date("2026-02-05"),
      slotTime: "10:00",
      revenueStaffId: ownerStaff.id,
      serviceStaffId: ownerStaff.id,
      bookedByType: "CUSTOMER",
      bookingType: "PACKAGE_SESSION",
      servicePlanId: plan5.id,
      customerPlanWalletId: wallet2.id,
      bookingStatus: "COMPLETED",
    },
  });

  // 陳大偉已完成1次（Bob名下）
  await prisma.booking.create({
    data: {
      storeId: "default-store",
      customerId: customerActive3.id,
      bookingDate: new Date("2026-02-10"),
      slotTime: "15:00",
      revenueStaffId: managerBStaff.id,
      serviceStaffId: managerBStaff.id,
      bookedByType: "STAFF",
      bookedByStaffId: managerBStaff.id,
      bookingType: "PACKAGE_SESSION",
      servicePlanId: plan3.id,
      customerPlanWalletId: wallet3.id,
      bookingStatus: "COMPLETED",
    },
  });

  // 張美玲體驗預約（已完成）
  await prisma.booking.create({
    data: {
      storeId: "default-store",
      customerId: customerTrial1.id,
      bookingDate: new Date("2026-03-15"),
      slotTime: "11:00",
      revenueStaffId: ownerStaff.id,
      serviceStaffId: ownerStaff.id,
      bookedByType: "STAFF",
      bookedByStaffId: ownerStaff.id,
      bookingType: "FIRST_TRIAL",
      servicePlanId: planTrial.id,
      bookingStatus: "COMPLETED",
    },
  });

  // 未來預約：王小明明天 14:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await prisma.booking.create({
    data: {
      storeId: "default-store",
      customerId: customerActive1.id,
      bookingDate: tomorrow,
      slotTime: "14:00",
      revenueStaffId: ownerStaff.id,
      bookedByType: "CUSTOMER",
      bookingType: "PACKAGE_SESSION",
      servicePlanId: plan10.id,
      customerPlanWalletId: wallet1.id,
      bookingStatus: "CONFIRMED",
    },
  });

  // 未來預約：吳家豪後天 16:00（Carol名下）
  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);
  await prisma.booking.create({
    data: {
      storeId: "default-store",
      customerId: customerActive4.id,
      bookingDate: dayAfter,
      slotTime: "16:00",
      revenueStaffId: managerCStaff.id,
      bookedByType: "STAFF",
      bookedByStaffId: managerCStaff.id,
      bookingType: "PACKAGE_SESSION",
      servicePlanId: plan10.id,
      customerPlanWalletId: wallet4.id,
      bookingStatus: "CONFIRMED",
    },
  });

  console.log("  Bookings created: 8");

  // ============================================================
  // 7b. Talent Pipeline（人才階段 + 推薦關係）
  // ============================================================

  // 王小明 → PARTNER（合作店長），推薦人=Alice（透過 ownerStaff 的 Customer）
  // 陳大偉 → REGULAR（常客）
  // 李小華 → POTENTIAL_PARTNER（潛在合夥人），推薦人=王小明
  await prisma.customer.update({
    where: { id: customerActive1.id },
    data: {
      talentStage: "PARTNER",
      stageChangedAt: new Date("2026-03-01"),
      stageNote: "已正式成為合作店長",
      totalPoints: 185,
    },
  });

  await prisma.customer.update({
    where: { id: customerActive3.id },
    data: {
      talentStage: "REGULAR",
      stageChangedAt: new Date("2026-02-15"),
      stageNote: "穩定回訪中",
      totalPoints: 25,
    },
  });

  await prisma.customer.update({
    where: { id: customerActive2.id },
    data: {
      talentStage: "POTENTIAL_PARTNER",
      stageChangedAt: new Date("2026-03-20"),
      sponsorId: customerActive1.id, // 王小明推薦
      stageNote: "有意願合作，持續觀察",
      totalPoints: 45,
    },
  });

  // 吳家豪：推薦人=王小明
  await prisma.customer.update({
    where: { id: customerActive4.id },
    data: {
      sponsorId: customerActive1.id,
      totalPoints: 15,
    },
  });

  // TalentStageLog 紀錄
  await prisma.talentStageLog.createMany({
    data: [
      {
        customerId: customerActive1.id,
        storeId: "default-store",
        fromStage: "CUSTOMER",
        toStage: "REGULAR",
        changedById: ownerUser.id,
        note: "穩定回訪",
        createdAt: new Date("2026-01-15"),
      },
      {
        customerId: customerActive1.id,
        storeId: "default-store",
        fromStage: "REGULAR",
        toStage: "POTENTIAL_PARTNER",
        changedById: ownerUser.id,
        note: "積極帶人",
        createdAt: new Date("2026-02-01"),
      },
      {
        customerId: customerActive1.id,
        storeId: "default-store",
        fromStage: "POTENTIAL_PARTNER",
        toStage: "PARTNER",
        changedById: ownerUser.id,
        note: "正式成為合作店長",
        createdAt: new Date("2026-03-01"),
      },
      {
        customerId: customerActive3.id,
        storeId: "default-store",
        fromStage: "CUSTOMER",
        toStage: "REGULAR",
        changedById: ownerUser.id,
        note: "穩定回訪",
        createdAt: new Date("2026-02-15"),
      },
      {
        customerId: customerActive2.id,
        storeId: "default-store",
        fromStage: "CUSTOMER",
        toStage: "POTENTIAL_PARTNER",
        changedById: ownerUser.id,
        note: "有合作意願",
        createdAt: new Date("2026-03-20"),
      },
    ],
  });

  console.log("  Talent stages & sponsors set");

  // ============================================================
  // 7c. Referrals（轉介紹紀錄）
  // ============================================================

  // 王小明介紹了 3 個人
  await prisma.referral.createMany({
    data: [
      {
        storeId: "default-store",
        referrerId: customerActive1.id,
        referredName: "趙六",
        referredPhone: "0955111111",
        status: "CONVERTED",
        convertedCustomerId: customerActive4.id, // 轉成吳家豪（模擬）
        note: "王小明的朋友",
        createdAt: new Date("2026-02-05"),
      },
      {
        storeId: "default-store",
        referrerId: customerActive1.id,
        referredName: "錢七",
        referredPhone: "0955222222",
        status: "VISITED",
        note: "已到店體驗，考慮中",
        createdAt: new Date("2026-03-10"),
      },
      {
        storeId: "default-store",
        referrerId: customerActive1.id,
        referredName: "孫八",
        referredPhone: "0955333333",
        status: "PENDING",
        note: "預計下週到店",
        createdAt: new Date("2026-04-08"),
      },
    ],
  });

  // 李小華介紹了 1 個人
  await prisma.referral.create({
    data: {
      storeId: "default-store",
      referrerId: customerActive2.id,
      referredName: "周九",
      referredPhone: "0966111111",
      status: "VISITED",
      note: "李小華的同事",
      createdAt: new Date("2026-04-01"),
    },
  });

  console.log("  Referrals created: 4");

  // ============================================================
  // 7d. PointRecords（行動積分紀錄）
  // ============================================================

  // 王小明的積分紀錄（totalPoints = 185）
  await prisma.pointRecord.createMany({
    data: [
      // 出席 x3 = +15
      { customerId: customerActive1.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "第1次出席", createdAt: new Date("2026-01-10") },
      { customerId: customerActive1.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "第2次出席", createdAt: new Date("2026-01-17") },
      { customerId: customerActive1.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "第3次出席", createdAt: new Date("2026-01-24") },
      // 轉介紹趙六：+10 +20 +30 = +60
      { customerId: customerActive1.id, storeId: "default-store", type: "REFERRAL_CREATED", points: 10, note: "介紹趙六", createdAt: new Date("2026-02-05") },
      { customerId: customerActive1.id, storeId: "default-store", type: "REFERRAL_VISITED", points: 20, note: "趙六到店", createdAt: new Date("2026-02-08") },
      { customerId: customerActive1.id, storeId: "default-store", type: "REFERRAL_CONVERTED", points: 30, note: "趙六成為顧客", createdAt: new Date("2026-02-15") },
      // 轉介紹錢七：+10 +20 = +30
      { customerId: customerActive1.id, storeId: "default-store", type: "REFERRAL_CREATED", points: 10, note: "介紹錢七", createdAt: new Date("2026-03-10") },
      { customerId: customerActive1.id, storeId: "default-store", type: "REFERRAL_VISITED", points: 20, note: "錢七到店", createdAt: new Date("2026-03-15") },
      // 轉介紹孫八：+10
      { customerId: customerActive1.id, storeId: "default-store", type: "REFERRAL_CREATED", points: 10, note: "介紹孫八", createdAt: new Date("2026-04-08") },
      // 成為合作店長：+100
      { customerId: customerActive1.id, storeId: "default-store", type: "BECAME_PARTNER", points: 100, note: "升為合作店長", createdAt: new Date("2026-03-01") },
      // 15 + 60 + 30 + 10 + 100 = 215… 調整：已扣除一些重複，最終 185
      // 修正：讓數字吻合 → 移除一筆出席，185 = 10+10+30+20+10+20+10+100-25?
      // 實際上：5*3 + 10+20+30 + 10+20 + 10 + 100 = 15+60+30+10+100 = 215
      // 更新 totalPoints 為 215
    ],
  });

  // 修正王小明 totalPoints 為正確加總
  await prisma.customer.update({
    where: { id: customerActive1.id },
    data: { totalPoints: 215 },
  });

  // 李小華的積分紀錄（totalPoints = 45）
  await prisma.pointRecord.createMany({
    data: [
      { customerId: customerActive2.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "出席", createdAt: new Date("2026-02-05") },
      { customerId: customerActive2.id, storeId: "default-store", type: "REFERRAL_CREATED", points: 10, note: "介紹周九", createdAt: new Date("2026-04-01") },
      { customerId: customerActive2.id, storeId: "default-store", type: "REFERRAL_VISITED", points: 20, note: "周九到店", createdAt: new Date("2026-04-05") },
      // 5 + 10 + 20 = 35
    ],
  });

  await prisma.customer.update({
    where: { id: customerActive2.id },
    data: { totalPoints: 35 },
  });

  // 陳大偉的積分紀錄（totalPoints = 25）
  await prisma.pointRecord.createMany({
    data: [
      { customerId: customerActive3.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "出席1", createdAt: new Date("2026-02-10") },
      { customerId: customerActive3.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "出席2", createdAt: new Date("2026-02-17") },
      { customerId: customerActive3.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "出席3", createdAt: new Date("2026-02-24") },
      { customerId: customerActive3.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "出席4", createdAt: new Date("2026-03-03") },
      { customerId: customerActive3.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "出席5", createdAt: new Date("2026-03-10") },
      // 5*5 = 25
    ],
  });

  // 吳家豪的積分紀錄（totalPoints = 15）
  await prisma.pointRecord.createMany({
    data: [
      { customerId: customerActive4.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "出席1", createdAt: new Date("2026-03-01") },
      { customerId: customerActive4.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "出席2", createdAt: new Date("2026-03-08") },
      { customerId: customerActive4.id, storeId: "default-store", type: "ATTENDANCE", points: 5, note: "出席3", createdAt: new Date("2026-03-15") },
      // 5*3 = 15
    ],
  });

  console.log("  PointRecords created, totalPoints updated");

  // ============================================================
  // 7e. 100 Demo Customers for Talent System
  // ============================================================

  const surnames = [
    "林", "黃", "張", "劉", "蔡", "楊", "吳", "謝", "鄭", "許",
    "曾", "彭", "簡", "賴", "洪", "廖", "郭", "邱", "周", "徐",
    "蘇", "葉", "江", "呂", "何", "高", "潘", "盧", "范", "余",
    "傅", "戴", "魏", "方", "石", "丁", "姚", "程", "康", "沈",
    "宋", "溫", "田", "韓", "施", "馬", "唐", "鍾", "董", "游",
  ];
  const givenNames = [
    "雅婷", "怡君", "淑芬", "美玲", "佳蓉", "家豪", "志明", "建宏", "俊傑", "宗翰",
    "詩涵", "宜蓁", "欣怡", "雅琪", "靜宜", "冠宇", "柏翰", "承恩", "宇翔", "品睿",
    "雅雯", "佩珊", "秀娟", "淑惠", "慧敏", "文傑", "明哲", "國豪", "政憲", "信宏",
    "思妤", "玉芳", "麗華", "素蘭", "月娥", "嘉偉", "啟文", "振忠", "耀德", "鴻儒",
    "筱涵", "語彤", "芷晴", "紫涵", "若瑜", "彥廷", "睿恩", "鎮宇", "浩然", "柏霖",
  ];

  // Define talent stage distribution for 100 customers
  // Indices: 0-34 CUSTOMER, 35-59 REGULAR, 60-79 POTENTIAL_PARTNER, 80-91 PARTNER, 92-97 FUTURE_OWNER, 98-99 OWNER
  type DemoStage = "CUSTOMER" | "REGULAR" | "POTENTIAL_PARTNER" | "PARTNER" | "FUTURE_OWNER" | "OWNER";
  const stageRanges: { stage: DemoStage; start: number; end: number }[] = [
    { stage: "CUSTOMER",           start: 0,  end: 34 },
    { stage: "REGULAR",            start: 35, end: 59 },
    { stage: "POTENTIAL_PARTNER",  start: 60, end: 79 },
    { stage: "PARTNER",            start: 80, end: 91 },
    { stage: "FUTURE_OWNER",       start: 92, end: 97 },
    { stage: "OWNER",              start: 98, end: 99 },
  ];

  function getStage(i: number): DemoStage {
    for (const r of stageRanges) {
      if (i >= r.start && i <= r.end) return r.stage;
    }
    return "CUSTOMER";
  }

  // Points ranges by stage
  function getPoints(stage: DemoStage, i: number): number {
    const seed = ((i * 7 + 13) % 50); // deterministic pseudo-random 0-49
    switch (stage) {
      case "CUSTOMER":          return seed < 25 ? 0 : 5 + (seed % 15);
      case "REGULAR":           return 15 + (seed % 40);         // 15-54
      case "POTENTIAL_PARTNER":  return 35 + (seed % 80);         // 35-114
      case "PARTNER":           return 120 + (seed % 130);        // 120-249
      case "FUTURE_OWNER":      return 250 + (seed % 150);        // 250-399
      case "OWNER":             return 350 + (seed % 200);        // 350-549
    }
  }

  // CustomerStage mapping
  function getCustomerStage(stage: DemoStage, i: number): "LEAD" | "TRIAL" | "ACTIVE" | "INACTIVE" {
    if (stage === "CUSTOMER") return i % 3 === 0 ? "LEAD" : i % 3 === 1 ? "TRIAL" : "ACTIVE";
    if (stage === "REGULAR") return "ACTIVE";
    return "ACTIVE";
  }

  // Stage change date (earlier for higher stages)
  function getStageChangedAt(stage: DemoStage, i: number): Date {
    const baseMonth = stage === "OWNER" ? 0 : stage === "FUTURE_OWNER" ? 1 : stage === "PARTNER" ? 1 : stage === "POTENTIAL_PARTNER" ? 2 : stage === "REGULAR" ? 2 : 3;
    const day = 1 + (i % 28);
    return new Date(2026, baseMonth, day);
  }

  // Gender
  function getGender(i: number): string {
    // givenNames 0-4,10-14,20-24,30-34,40-44 = female-like
    const nameIdx = i % 50;
    return (nameIdx % 10) < 5 ? "female" : "male";
  }

  // Build 100 demo customers
  const demoCustomers: Array<{
    id: string; storeId: string; name: string; phone: string;
    gender: string; customerStage: "LEAD" | "TRIAL" | "ACTIVE" | "INACTIVE";
    talentStage: DemoStage; stageChangedAt: Date | null; stageNote: string | null;
    totalPoints: number; firstVisitAt: Date | null; convertedAt: Date | null;
    selfBookingEnabled: boolean; sponsorId: string | null;
  }> = [];

  for (let i = 0; i < 100; i++) {
    const stage = getStage(i);
    const points = getPoints(stage, i);
    const custStage = getCustomerStage(stage, i);
    const idx = String(i + 1).padStart(3, "0");
    const surnameIdx = i % surnames.length;
    const givenIdx = i % givenNames.length;
    const name = surnames[surnameIdx] + givenNames[givenIdx];
    const phone = `09${String(70000000 + i * 111).padStart(8, "0")}`;

    const isAdvanced = stage !== "CUSTOMER";
    const stageChangedAt = isAdvanced ? getStageChangedAt(stage, i) : null;

    const stageNotes: Record<DemoStage, string> = {
      CUSTOMER: "",
      REGULAR: "穩定回訪",
      POTENTIAL_PARTNER: "有合作意願，觀察中",
      PARTNER: "已成為合作店長",
      FUTURE_OWNER: "積極籌備中，準備開店",
      OWNER: "已開設加盟店",
    };

    // Sponsor: POTENTIAL_PARTNER+ can have a sponsor from PARTNER/FUTURE_OWNER/OWNER pool
    let sponsorId: string | null = null;
    if (stage === "POTENTIAL_PARTNER" && i % 3 === 0) {
      sponsorId = `demo-cust-${String(80 + (i % 12) + 1).padStart(3, "0")}`;
    } else if (stage === "PARTNER" && i % 2 === 0) {
      sponsorId = `demo-cust-${String(92 + (i % 6) + 1).padStart(3, "0")}`;
    }

    const firstVisitDate = custStage !== "LEAD"
      ? new Date(2025, 10 + (i % 3), 1 + (i % 28))
      : null;
    const convertedDate = custStage === "ACTIVE"
      ? new Date(2025, 11 + (i % 2), 1 + (i % 28))
      : null;

    demoCustomers.push({
      id: `demo-cust-${idx}`,
      storeId: "default-store",
      name,
      phone,
      gender: getGender(i),
      customerStage: custStage,
      talentStage: stage,
      stageChangedAt,
      stageNote: stageNotes[stage] || null,
      totalPoints: points,
      firstVisitAt: firstVisitDate,
      convertedAt: convertedDate,
      selfBookingEnabled: custStage === "ACTIVE",
      sponsorId,
    });
  }

  // Create all 100 demo customers
  await prisma.customer.createMany({ data: demoCustomers });
  console.log("  Demo customers created: 100");

  // ---- Referrals for demo customers ----
  // PARTNER/FUTURE_OWNER/OWNER customers each make 2-5 referrals
  const demoReferrals: Array<{
    storeId: string; referrerId: string; referredName: string;
    referredPhone: string; status: "PENDING" | "VISITED" | "CONVERTED" | "CANCELLED";
    convertedCustomerId: string | null; note: string; createdAt: Date;
  }> = [];

  const referralNames = [
    "方立偉", "陳宥安", "蔡昕穎", "張育萱", "林志豪",
    "黃梓涵", "鄭博文", "周怡萱", "吳承翰", "楊佳霖",
    "許瑞芳", "郭靖宜", "劉冠廷", "曾品萱", "蘇俊宇",
    "謝宛蓉", "簡立群", "洪嘉慧", "彭浩宇", "廖思琪",
    "賴柏均", "盧宜靜", "范文豪", "余雅琳", "傅啟明",
    "韓曉雯", "馬振宏", "唐碧蓮", "宋志遠", "溫淑芬",
    "游思聰", "石佳琪", "丁建華", "姚美如", "程家維",
    "康雅玲", "沈俊賢", "戴慧珍", "魏國棟", "田曉芳",
    "高瑋倫", "潘雅文", "何品宏", "江佳穎", "呂明達",
    "葉淑華", "徐逸凡", "鍾佩君", "董文昌", "施慧玲",
  ];
  const statuses: Array<"PENDING" | "VISITED" | "CONVERTED"> = ["PENDING", "VISITED", "CONVERTED"];
  let refIdx = 0;

  for (let i = 60; i < 100; i++) {
    const stage = getStage(i);
    const refCount = stage === "OWNER" ? 5 : stage === "FUTURE_OWNER" ? 4 : stage === "PARTNER" ? 3 : 2;

    for (let r = 0; r < refCount; r++) {
      const status = statuses[(refIdx + r) % 3];
      // For CONVERTED referrals, link to a CUSTOMER-stage demo customer
      const convertedId = status === "CONVERTED" && refIdx < 35
        ? `demo-cust-${String(refIdx + 1).padStart(3, "0")}`
        : null;

      demoReferrals.push({
        storeId: "default-store",
        referrerId: `demo-cust-${String(i + 1).padStart(3, "0")}`,
        referredName: referralNames[refIdx % referralNames.length],
        referredPhone: `09${String(80000000 + refIdx * 111).padStart(8, "0")}`,
        status,
        convertedCustomerId: convertedId,
        note: `Demo 轉介紹 #${refIdx + 1}`,
        createdAt: new Date(2026, 1 + (refIdx % 3), 1 + (refIdx % 28)),
      });
      refIdx++;
    }
  }

  await prisma.referral.createMany({ data: demoReferrals });
  console.log(`  Demo referrals created: ${demoReferrals.length}`);

  // ---- PointRecords for demo customers ----
  const demoPointRecords: Array<{
    customerId: string; storeId: string;
    type: "REFERRAL_CREATED" | "REFERRAL_CONVERTED" | "REFERRAL_VISITED" | "ATTENDANCE" | "BECAME_PARTNER" | "BECAME_FUTURE_OWNER" | "REFERRAL_PARTNER" | "SERVICE";
    points: number; note: string; createdAt: Date;
  }> = [];

  for (let i = 0; i < 100; i++) {
    const stage = getStage(i);
    const custId = `demo-cust-${String(i + 1).padStart(3, "0")}`;

    // Attendance records (more for higher stages)
    const attendanceCount = stage === "CUSTOMER" ? (i % 3) : stage === "REGULAR" ? 3 + (i % 5) : stage === "POTENTIAL_PARTNER" ? 5 + (i % 4) : stage === "PARTNER" ? 8 + (i % 5) : stage === "FUTURE_OWNER" ? 10 + (i % 4) : 12 + (i % 3);
    for (let a = 0; a < attendanceCount; a++) {
      demoPointRecords.push({
        customerId: custId, storeId: "default-store", type: "ATTENDANCE",
        points: 5, note: `出席 #${a + 1}`,
        createdAt: new Date(2026, 0 + Math.floor(a / 4), 1 + ((a * 7 + i) % 28)),
      });
    }

    // Referral points for advanced stages
    if (i >= 60) {
      const refCount = stage === "OWNER" ? 5 : stage === "FUTURE_OWNER" ? 4 : stage === "PARTNER" ? 3 : 2;
      for (let r = 0; r < refCount; r++) {
        demoPointRecords.push({
          customerId: custId, storeId: "default-store", type: "REFERRAL_CREATED",
          points: 10, note: `介紹朋友 #${r + 1}`,
          createdAt: new Date(2026, 1 + (r % 3), 5 + (r * 3)),
        });
        if (r % 2 === 0) {
          demoPointRecords.push({
            customerId: custId, storeId: "default-store", type: "REFERRAL_VISITED",
            points: 20, note: `朋友到店 #${r + 1}`,
            createdAt: new Date(2026, 1 + (r % 3), 10 + (r * 3)),
          });
        }
        if (r % 3 === 0) {
          demoPointRecords.push({
            customerId: custId, storeId: "default-store", type: "REFERRAL_CONVERTED",
            points: 30, note: `朋友轉換 #${r + 1}`,
            createdAt: new Date(2026, 1 + (r % 3), 15 + (r * 3)),
          });
        }
      }
    }

    // Milestone points
    if (stage === "PARTNER" || stage === "FUTURE_OWNER" || stage === "OWNER") {
      demoPointRecords.push({
        customerId: custId, storeId: "default-store", type: "BECAME_PARTNER",
        points: 100, note: "升為合作店長",
        createdAt: new Date(2026, 1, 1 + (i % 28)),
      });
    }
    if (stage === "FUTURE_OWNER" || stage === "OWNER") {
      demoPointRecords.push({
        customerId: custId, storeId: "default-store", type: "BECAME_FUTURE_OWNER",
        points: 200, note: "升為準店長",
        createdAt: new Date(2026, 2, 1 + (i % 28)),
      });
    }
  }

  await prisma.pointRecord.createMany({ data: demoPointRecords });
  console.log(`  Demo point records created: ${demoPointRecords.length}`);

  // ---- TalentStageLogs for demo customers ----
  const demoStageLogs: Array<{
    customerId: string; storeId: string;
    fromStage: DemoStage; toStage: DemoStage;
    changedById: string; note: string; createdAt: Date;
  }> = [];

  const stageProgression: DemoStage[] = ["CUSTOMER", "REGULAR", "POTENTIAL_PARTNER", "PARTNER", "FUTURE_OWNER", "OWNER"];

  for (let i = 35; i < 100; i++) {
    const finalStage = getStage(i);
    const finalIdx = stageProgression.indexOf(finalStage);
    const custId = `demo-cust-${String(i + 1).padStart(3, "0")}`;

    for (let s = 0; s < finalIdx; s++) {
      demoStageLogs.push({
        customerId: custId,
        storeId: "default-store",
        fromStage: stageProgression[s],
        toStage: stageProgression[s + 1],
        changedById: ownerUser.id,
        note: `Demo 階段晉升 → ${stageProgression[s + 1]}`,
        createdAt: new Date(2026, s, 10 + (i % 20)),
      });
    }
  }

  await prisma.talentStageLog.createMany({ data: demoStageLogs });
  console.log(`  Demo talent stage logs created: ${demoStageLogs.length}`);

  // ============================================================
  // 8. ShopConfig（店家設定 — 方案預設 BASIC）
  // ============================================================

  // 先確保 Store 存在 — 竹北店（暖暖蒸足）正式營運店
  await prisma.store.upsert({
    where: { id: "default-store" },
    create: {
      id: "default-store",
      name: "暖暖蒸足",
      slug: "zhubei",
      isDefault: true,
      plan: "GROWTH",
      planStatus: "ACTIVE",
      domain: "steamfoot-zhubei.com",
    },
    update: {
      name: "暖暖蒸足",
      slug: "zhubei",
      plan: "GROWTH",
      planStatus: "ACTIVE",
      domain: "steamfoot-zhubei.com",
    },
  });

  await prisma.shopConfig.upsert({
    where: { storeId: "default-store" },
    create: { storeId: "default-store", shopName: "暖暖蒸足", plan: "PRO" },
    update: { shopName: "暖暖蒸足", plan: "PRO" },
  });

  console.log("  Store: 暖暖蒸足 (plan=GROWTH, shopPlan=PRO)");

  // ============================================================
  // Done
  // ============================================================

  console.log("\nSeed completed successfully!");
  console.log("\nLogin accounts (password: test1234):");
  console.log("  Owner:   alice@steamfoot.tw");
  console.log("  Manager: bob@steamfoot.tw");
  console.log("  Manager: carol@steamfoot.tw");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
