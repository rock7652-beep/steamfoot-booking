/**
 * 人才系統 Demo 補強 — 提升 readiness / 帶出人數
 *
 * 執行：npx tsx prisma/seed-talent-boost.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function dateAt(daysAgo: number): Date {
  const d = new Date("2026-04-14T10:00:00+08:00");
  d.setDate(d.getDate() - daysAgo);
  return d;
}

async function main() {
  console.log("=== 人才系統 Demo 補強 ===\n");

  const staffId = "cmnx8ma280002sbcoh0tnfxao"; // Alice 店主
  const ownerUser = await prisma.user.findFirst({
    where: { role: "ADMIN", staff: { storeId: "default-store" } },
  });
  if (!ownerUser) { console.error("找不到 ADMIN"); process.exit(1); }

  // ── 1. 王小明：boost to READY ──────────────────────

  const wangxm = await prisma.customer.findFirst({
    where: { name: "王小明", storeId: "default-store" },
  });
  if (!wangxm) { console.error("找不到王小明"); process.exit(1); }

  console.log("1. 補強王小明 readiness → READY...");

  // 1a. 加 50 筆 COMPLETED bookings（每週一次，回推一年）
  const wangBookings = [];
  for (let i = 0; i < 50; i++) {
    const daysAgo = 7 + i * 7; // 每週一筆
    const d = dateAt(daysAgo);
    wangBookings.push({
      customerId: wangxm.id,
      storeId: "default-store",
      bookingDate: d,
      slotTime: "10:00",
      revenueStaffId: staffId,
      bookedByType: "STAFF" as const,
      bookedByStaffId: staffId,
      bookingType: "PACKAGE_SESSION" as const,
      bookingStatus: "COMPLETED" as const,
    });
  }
  await prisma.booking.createMany({ data: wangBookings });
  console.log(`   +50 COMPLETED bookings`);

  // 1b. stageChangedAt 設為 360 天前 → timeScore = 25
  await prisma.customer.update({
    where: { id: wangxm.id },
    data: { stageChangedAt: dateAt(360) },
  });
  console.log(`   stageChangedAt → 360 days ago`);

  // 1c. 加 3 筆有效 Referral（讓 referralCount 達 5）
  // 王小明目前有 2 referrals (VISITED/CONVERTED)，再加 3
  for (let i = 0; i < 3; i++) {
    await prisma.referral.create({
      data: {
        storeId: "default-store",
        referrerId: wangxm.id,
        referredName: `友人${String.fromCharCode(65 + i)}`,
        referredPhone: `0977${i}11111`,
        status: "CONVERTED",
        note: "王小明長期推薦的朋友",
        createdAt: dateAt(30 + i * 20),
      },
    });
  }
  console.log(`   +3 CONVERTED referrals (total 5)`);

  // 預估分數: referral=25, attendance=25, rate=25, time=25 → 100 READY!

  // ── 2. 張欣怡：boost to HIGH ──────────────────────

  const zhangxy = await prisma.customer.findFirst({
    where: { name: "張欣怡", storeId: "default-store" },
  });
  if (!zhangxy) { console.error("找不到張欣怡"); process.exit(1); }

  console.log("\n2. 補強張欣怡 readiness → HIGH...");

  // 2a. 加 30 筆 COMPLETED bookings
  const zhangBookings = [];
  for (let i = 0; i < 30; i++) {
    const daysAgo = 7 + i * 7;
    const d = dateAt(daysAgo);
    zhangBookings.push({
      customerId: zhangxy.id,
      storeId: "default-store",
      bookingDate: d,
      slotTime: "14:00",
      revenueStaffId: staffId,
      bookedByType: "STAFF" as const,
      bookedByStaffId: staffId,
      bookingType: "PACKAGE_SESSION" as const,
      bookingStatus: "COMPLETED" as const,
    });
  }
  await prisma.booking.createMany({ data: zhangBookings });
  console.log(`   +30 COMPLETED bookings`);

  // 2b. stageChangedAt 設為 240 天前 → timeScore = 20
  await prisma.customer.update({
    where: { id: zhangxy.id },
    data: { stageChangedAt: dateAt(240) },
  });
  console.log(`   stageChangedAt → 240 days ago`);

  // 預估分數: referral=15, attendance=15, rate=25, time=20 → 75... not HIGH (56+) actually that IS HIGH
  // Wait: 15+15+25+20 = 75. HIGH ≥ 56. ✓

  // ── 3. 帶出人數：promoted sponsored customers ─────

  console.log("\n3. 補強帶出人數...");

  // 3a. 王小明 sponsored 李小華 → PARTNER
  const lihua = await prisma.customer.findFirst({
    where: { name: "李小華", storeId: "default-store" },
  });
  if (lihua) {
    await prisma.customer.update({
      where: { id: lihua.id },
      data: {
        talentStage: "PARTNER",
        stageChangedAt: dateAt(30),
        stageNote: "由王小明帶出，已成為合作店長",
      },
    });
    await prisma.talentStageLog.create({
      data: {
        customerId: lihua.id,
        storeId: "default-store",
        fromStage: "POTENTIAL_PARTNER",
        toStage: "PARTNER",
        changedById: ownerUser.id,
        note: "王小明帶出，正式成為合作店長",
        createdAt: dateAt(30),
      },
    });
    console.log(`   李小華 → PARTNER (王小明帶出)`);
  }

  // 3b. 張欣怡 sponsored 王柏翰 → PARTNER
  const wangbh = await prisma.customer.findFirst({
    where: { name: "王柏翰", storeId: "default-store" },
  });
  if (wangbh) {
    await prisma.customer.update({
      where: { id: wangbh.id },
      data: {
        talentStage: "PARTNER",
        stageChangedAt: dateAt(15),
        stageNote: "由張欣怡帶出，已成為合作店長",
      },
    });
    // Add stage logs
    await prisma.talentStageLog.createMany({
      data: [
        {
          customerId: wangbh.id,
          storeId: "default-store",
          fromStage: "CUSTOMER",
          toStage: "REGULAR",
          changedById: ownerUser.id,
          note: "穩定回訪",
          createdAt: dateAt(60),
        },
        {
          customerId: wangbh.id,
          storeId: "default-store",
          fromStage: "REGULAR",
          toStage: "POTENTIAL_PARTNER",
          changedById: ownerUser.id,
          note: "開始帶人",
          createdAt: dateAt(30),
        },
        {
          customerId: wangbh.id,
          storeId: "default-store",
          fromStage: "POTENTIAL_PARTNER",
          toStage: "PARTNER",
          changedById: ownerUser.id,
          note: "張欣怡帶出，成為合作店長",
          createdAt: dateAt(15),
        },
      ],
    });
    console.log(`   王柏翰 → PARTNER (張欣怡帶出)`);
  }

  // ── 4. 也補劉宜蓁的 readiness（第 3 位候選人）────
  const liuyz = await prisma.customer.findFirst({
    where: { name: "劉宜蓁", storeId: "default-store" },
  });
  if (liuyz) {
    console.log("\n4. 補強劉宜蓁 readiness...");
    const liuBookings = [];
    for (let i = 0; i < 20; i++) {
      const daysAgo = 7 + i * 7;
      liuBookings.push({
        customerId: liuyz.id,
        storeId: "default-store",
        bookingDate: dateAt(daysAgo),
        slotTime: "16:00",
        revenueStaffId: staffId,
        bookedByType: "STAFF" as const,
        bookedByStaffId: staffId,
        bookingType: "PACKAGE_SESSION" as const,
        bookingStatus: "COMPLETED" as const,
      });
    }
    await prisma.booking.createMany({ data: liuBookings });

    await prisma.customer.update({
      where: { id: liuyz.id },
      data: { stageChangedAt: dateAt(180) },
    });
    console.log(`   +20 COMPLETED bookings, stageChangedAt → 180 days ago`);
    // 預估: referral=10, attendance=10, rate=25, time=15 → 60. HIGH!
  }

  // ── 驗證 readiness ─────────────────────────────────

  console.log("\n=== 驗證 ===");

  for (const name of ["王小明", "張欣怡", "劉宜蓁"]) {
    const c = await prisma.customer.findFirst({
      where: { name, storeId: "default-store" },
      select: { id: true, talentStage: true, totalPoints: true, stageChangedAt: true },
    });
    if (!c) continue;

    // referralCount
    const sponsorCount = await prisma.customer.count({ where: { sponsorId: c.id } });
    const referralCount = await prisma.referral.count({
      where: { referrerId: c.id, storeId: "default-store", status: { in: ["VISITED", "CONVERTED"] } },
    });
    const refCount = Math.max(sponsorCount, referralCount);

    // attendance
    const completed = await prisma.booking.count({
      where: { customerId: c.id, storeId: "default-store", bookingStatus: "COMPLETED" },
    });
    const noShow = await prisma.booking.count({
      where: { customerId: c.id, storeId: "default-store", bookingStatus: "NO_SHOW" },
    });
    const rate = completed + noShow > 0 ? completed / (completed + noShow) : 0;

    // time
    const daysInStage = c.stageChangedAt
      ? Math.floor((new Date("2026-04-14").getTime() - c.stageChangedAt.getTime()) / 86400000)
      : 0;

    const referralScore = Math.min(refCount * 5, 25);
    const attendanceScore = Math.min(Math.floor(completed / 2), 25);
    const attendanceRateScore = Math.round(rate * 25);
    const timeScore = Math.min(Math.floor(daysInStage / 12), 25);
    const total = referralScore + attendanceScore + attendanceRateScore + timeScore;
    const level = total >= 80 ? "READY" : total >= 56 ? "HIGH" : total >= 31 ? "MEDIUM" : "LOW";

    // mentored count
    const mentored = await prisma.customer.count({
      where: { sponsorId: c.id, talentStage: { in: ["PARTNER", "FUTURE_OWNER", "OWNER"] } },
    });

    console.log(`  ${name} (${c.talentStage}):`);
    console.log(`    referral=${referralScore} attendance=${attendanceScore} rate=${attendanceRateScore} time=${timeScore}`);
    console.log(`    total=${total} → ${level} | 帶出=${mentored}`);
  }

  console.log("\n✅ Demo 補強完成");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
