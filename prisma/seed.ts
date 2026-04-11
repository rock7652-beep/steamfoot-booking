import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

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
      role: "STORE_MANAGER",
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
      role: "STORE_MANAGER",
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
  // 8. ShopConfig（店家設定 — 方案預設 BASIC）
  // ============================================================

  // 先確保 Store 存在
  await prisma.store.upsert({
    where: { id: "default-store" },
    create: { id: "default-store", name: "蒸足", slug: "default", isDefault: true },
    update: {},
  });

  await prisma.shopConfig.upsert({
    where: { storeId: "default-store" },
    create: { storeId: "default-store", shopName: "蒸足", plan: "BASIC" },
    update: {},  // 已存在則不覆蓋
  });

  console.log("  ShopConfig: default (plan=BASIC)");

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
