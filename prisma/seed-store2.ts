/**
 * B7-3: 建立第二家店「蒸足 台中測試店」
 *
 * 用途：驗證跨店資料隔離
 * 執行：npx tsx prisma/seed-store2.ts
 *
 * 包含：
 * - Store + ShopConfig
 * - OWNER + STAFF User/Staff
 * - 5 位 Customer（含 2 位與竹北店重複 phone/email）
 * - 3 筆 Booking
 * - 2 筆 Transaction
 */

import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

const STORE_ID = "taichung-store";
const PASSWORD = hashSync("1234", 10);

async function main() {
  console.log("=== B7-3: 建立第二家店 ===\n");

  // Check if already exists
  const existing = await prisma.store.findUnique({ where: { id: STORE_ID } });
  if (existing) {
    console.log("⚠️  台中測試店已存在，跳過建立");
    return;
  }

  // 1. Store
  const store = await prisma.store.create({
    data: {
      id: STORE_ID,
      name: "蒸足 台中測試店",
      slug: "taichung",
      isDefault: false,
      plan: "GROWTH",
      planStatus: "ACTIVE",
    },
  });
  console.log("✅ Store:", store.name);

  // 2. ShopConfig
  await prisma.shopConfig.create({
    data: {
      storeId: STORE_ID,
      shopName: "蒸足 台中測試店",
    },
  });
  console.log("✅ ShopConfig created");

  // 3. OWNER — David 台中店長
  const ownerUser = await prisma.user.create({
    data: {
      name: "David 台中店長",
      phone: "0955000001",
      email: "david@steamfoot.tw",
      passwordHash: PASSWORD,
      role: "OWNER",
      status: "ACTIVE",
    },
  });
  const ownerStaff = await prisma.staff.create({
    data: {
      userId: ownerUser.id,
      storeId: STORE_ID,
      displayName: "David 台中店長",
      isOwner: true,
    },
  });
  console.log("✅ OWNER: David 台中店長 (0955000001)");

  // 4. STAFF — Eve 台中員工
  const staffUser = await prisma.user.create({
    data: {
      name: "Eve 台中員工",
      phone: "0955000002",
      email: "eve@steamfoot.tw",
      passwordHash: PASSWORD,
      role: "OWNER",
      status: "ACTIVE",
    },
  });
  const eveStaff = await prisma.staff.create({
    data: {
      userId: staffUser.id,
      storeId: STORE_ID,
      displayName: "Eve 台中員工",
      isOwner: false,
    },
  });
  console.log("✅ STAFF: Eve 台中員工 (0955000002)");

  // 5. ServicePlan
  const plan = await prisma.servicePlan.create({
    data: {
      storeId: STORE_ID,
      name: "單次體驗",
      category: "SINGLE",
      price: 600,
      sessionCount: 1,
      isActive: true,
    },
  });

  // 6. Customers — 5 位（含 2 位與竹北店重複 phone/email）
  // 先查竹北店的顧客 phone/email 做重複測試
  const zhubeiCustomers = await prisma.customer.findMany({
    where: { storeId: "default-store" },
    select: { phone: true, email: true },
    take: 2,
  });

  const customers = [];

  // 重複 phone/email 的顧客 1
  if (zhubeiCustomers[0]) {
    const c = await prisma.customer.create({
      data: {
        storeId: STORE_ID,
        name: "台中顧客A（與竹北同phone）",
        phone: zhubeiCustomers[0].phone, // 刻意與竹北重複
        email: zhubeiCustomers[0].email, // 刻意與竹北重複
        customerStage: "LEAD",
        assignedStaffId: ownerStaff.id,
      },
    });
    customers.push(c);
    console.log(`✅ Customer (重複phone/email): ${c.name} — phone=${c.phone}`);
  }

  // 重複 phone 的顧客 2
  if (zhubeiCustomers[1]) {
    const c = await prisma.customer.create({
      data: {
        storeId: STORE_ID,
        name: "台中顧客B（與竹北同phone）",
        phone: zhubeiCustomers[1].phone,
        customerStage: "LEAD",
        assignedStaffId: ownerStaff.id,
      },
    });
    customers.push(c);
    console.log(`✅ Customer (重複phone): ${c.name} — phone=${c.phone}`);
  }

  // 台中獨有顧客 3-5
  for (let i = 3; i <= 5; i++) {
    const c = await prisma.customer.create({
      data: {
        storeId: STORE_ID,
        name: `台中顧客${String.fromCharCode(64 + i)}`,
        phone: `09550001${String(i).padStart(2, "0")}`,
        customerStage: "LEAD",
        assignedStaffId: i <= 4 ? ownerStaff.id : eveStaff.id,
      },
    });
    customers.push(c);
    console.log(`✅ Customer: ${c.name}`);
  }

  // 7. Bookings — 3 筆
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  for (let i = 0; i < 3 && i < customers.length; i++) {
    const b = await prisma.booking.create({
      data: {
        storeId: STORE_ID,
        customerId: customers[i].id,
        bookingDate: tomorrow,
        slotTime: `${10 + i}:00`,
        revenueStaffId: ownerStaff.id,
        bookingType: "SINGLE",
        bookingStatus: "CONFIRMED",
        people: 1,
      },
    });
    console.log(`✅ Booking: ${customers[i].name} @ ${b.slotTime}`);
  }

  // 8. Transactions — 2 筆
  for (let i = 0; i < 2 && i < customers.length; i++) {
    const t = await prisma.transaction.create({
      data: {
        storeId: STORE_ID,
        customerId: customers[i].id,
        revenueStaffId: ownerStaff.id,
        transactionType: "SINGLE_PURCHASE",
        amount: 600,
        paymentMethod: "CASH",
        planId: plan.id,
        transactionDate: new Date(),
      },
    });
    console.log(`✅ Transaction: ${customers[i].name} — $${t.amount}`);
  }

  console.log("\n=== 第二家店建立完成 ===");
  console.log(`Store ID: ${STORE_ID}`);
  console.log(`OWNER 登入: 0955000001 / 1234`);
  console.log(`Customers: ${customers.length} 位`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
