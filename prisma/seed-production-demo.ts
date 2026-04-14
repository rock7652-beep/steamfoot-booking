/**
 * Production-Safe Demo Seed — 100 位展示顧客 + 展示主角補強
 *
 * 執行：npx tsx prisma/seed-production-demo.ts
 *
 * 🛡️ 安全特性：
 * - 只操作 id LIKE 'demo-cust-%' 的顧客（不動正式資料）
 * - 重跑時先清除舊 demo 資料再重建
 * - 展示主角（王小明/張欣怡/劉宜蓁）使用固定 ID
 * - 不執行 TRUNCATE、不碰非 demo 資料
 *
 * 適用：Production / Staging / Dev 環境皆安全
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STORE_ID = "default-store";

// ── 固定展示主角 ID ──────────────────────────────────────
const WANG_XM_ID = "demo-cust-wang-xiaoming";   // 王小明 PARTNER → READY
const ZHANG_XY_ID = "demo-cust-zhang-xinyi";     // 張欣怡 FUTURE_OWNER → HIGH
const LIU_YZ_ID = "demo-cust-liu-yizhen";        // 劉宜蓁 POTENTIAL_PARTNER → HIGH

// ── 工具函式 ──────────────────────────────────────────────
function dateAt(daysAgo: number): Date {
  const d = new Date("2026-04-14T10:00:00+08:00");
  d.setDate(d.getDate() - daysAgo);
  return d;
}

const SURNAMES = [
  "林", "黃", "張", "劉", "蔡", "楊", "吳", "謝", "鄭", "許",
  "曾", "彭", "簡", "賴", "洪", "廖", "郭", "邱", "周", "徐",
  "蘇", "葉", "江", "呂", "何", "高", "潘", "盧", "范", "余",
  "傅", "戴", "魏", "方", "石", "丁", "姚", "程", "康", "沈",
  "宋", "溫", "田", "韓", "施", "馬", "唐", "鍾", "董", "游",
];
const GIVEN_NAMES = [
  "雅婷", "怡君", "淑芬", "美玲", "佳蓉", "家豪", "志明", "建宏", "俊傑", "宗翰",
  "詩涵", "宜蓁", "欣怡", "雅琪", "靜宜", "冠宇", "柏翰", "承恩", "宇翔", "品睿",
  "雅雯", "佩珊", "秀娟", "淑惠", "慧敏", "文傑", "明哲", "國豪", "政憲", "信宏",
  "思妤", "玉芳", "麗華", "素蘭", "月娥", "嘉偉", "啟文", "振忠", "耀德", "鴻儒",
  "筱涵", "語彤", "芷晴", "紫涵", "若瑜", "彥廷", "睿恩", "鎮宇", "浩然", "柏霖",
];

type DemoStage = "CUSTOMER" | "REGULAR" | "POTENTIAL_PARTNER" | "PARTNER" | "FUTURE_OWNER" | "OWNER";
type CustStage = "LEAD" | "TRIAL" | "ACTIVE" | "INACTIVE";

// ── 主程式 ────────────────────────────────────────────────
async function main() {
  console.log("===== Production-Safe Demo Seed =====\n");

  // 找到 owner user（用於 changedById）
  const ownerUser = await prisma.user.findFirst({
    where: { role: "ADMIN", staff: { storeId: STORE_ID } },
  });
  if (!ownerUser) {
    console.error("❌ 找不到 ADMIN 使用者，請先確認基本 seed 已執行");
    process.exit(1);
  }
  const ownerStaff = await prisma.staff.findFirst({
    where: { userId: ownerUser.id, storeId: STORE_ID },
  });
  if (!ownerStaff) {
    console.error("❌ 找不到 owner staff");
    process.exit(1);
  }

  // ============================================================
  // Step 1: 清除舊 demo 資料（只刪 demo-cust-* 開頭的）
  // ============================================================
  console.log("1. 清除舊 demo 資料...");

  // 先刪關聯資料，再刪顧客
  const demoIds = (await prisma.customer.findMany({
    where: { id: { startsWith: "demo-cust-" } },
    select: { id: true },
  })).map(c => c.id);

  if (demoIds.length > 0) {
    await prisma.pointRecord.deleteMany({ where: { customerId: { in: demoIds } } });
    await prisma.talentStageLog.deleteMany({ where: { customerId: { in: demoIds } } });
    await prisma.referral.deleteMany({ where: { referrerId: { in: demoIds } } });
    await prisma.booking.deleteMany({ where: { customerId: { in: demoIds } } });
    // 先清除 sponsorId 自引用
    await prisma.customer.updateMany({ where: { sponsorId: { in: demoIds } }, data: { sponsorId: null } });
    await prisma.customer.deleteMany({ where: { id: { in: demoIds } } });
    console.log(`   已清除 ${demoIds.length} 位舊 demo 顧客及其關聯資料`);
  } else {
    console.log("   無舊 demo 資料");
  }

  // ============================================================
  // Step 2: 建立 100 位 Demo 顧客
  // ============================================================
  console.log("\n2. 建立 100 位 Demo 顧客...");

  // Stage 分佈: 0-34 CUSTOMER, 35-59 REGULAR, 60-79 POTENTIAL_PARTNER, 80-91 PARTNER, 92-97 FUTURE_OWNER, 98-99 OWNER
  const stageRanges: { stage: DemoStage; start: number; end: number }[] = [
    { stage: "CUSTOMER",          start: 0,  end: 34 },
    { stage: "REGULAR",           start: 35, end: 59 },
    { stage: "POTENTIAL_PARTNER", start: 60, end: 79 },
    { stage: "PARTNER",           start: 80, end: 91 },
    { stage: "FUTURE_OWNER",      start: 92, end: 97 },
    { stage: "OWNER",             start: 98, end: 99 },
  ];

  function getStage(i: number): DemoStage {
    for (const r of stageRanges) { if (i >= r.start && i <= r.end) return r.stage; }
    return "CUSTOMER";
  }

  function getPoints(stage: DemoStage, i: number): number {
    const s = ((i * 7 + 13) % 50);
    switch (stage) {
      case "CUSTOMER":          return s < 25 ? 0 : 5 + (s % 15);
      case "REGULAR":           return 15 + (s % 40);
      case "POTENTIAL_PARTNER":  return 35 + (s % 80);
      case "PARTNER":           return 120 + (s % 130);
      case "FUTURE_OWNER":      return 250 + (s % 150);
      case "OWNER":             return 350 + (s % 200);
    }
  }

  function getCustStage(stage: DemoStage, i: number): CustStage {
    if (stage === "CUSTOMER") return i % 3 === 0 ? "LEAD" : i % 3 === 1 ? "TRIAL" : "ACTIVE";
    return "ACTIVE";
  }

  function getStageChangedAt(stage: DemoStage, i: number): Date | null {
    if (stage === "CUSTOMER") return null;
    const m = stage === "OWNER" ? 0 : stage === "FUTURE_OWNER" ? 1 : stage === "PARTNER" ? 1 : stage === "POTENTIAL_PARTNER" ? 2 : 3;
    return new Date(2026, m, 1 + (i % 28));
  }

  const stageNotes: Record<DemoStage, string | null> = {
    CUSTOMER: null,
    REGULAR: "穩定回訪",
    POTENTIAL_PARTNER: "有合作意願，觀察中",
    PARTNER: "已成為合作店長",
    FUTURE_OWNER: "積極籌備中，準備開店",
    OWNER: "已開設加盟店",
  };

  // 展示主角在 index 位置上的固定配置（覆蓋預設值）
  // index 80 = 王小明 (PARTNER), index 92 = 張欣怡 (FUTURE_OWNER), index 62 = 劉宜蓁 (POTENTIAL_PARTNER)
  const showcaseOverrides: Record<number, { id: string; name: string; phone: string }> = {
    80: { id: WANG_XM_ID, name: "王小明", phone: "0911111111" },
    92: { id: ZHANG_XY_ID, name: "張欣怡", phone: "0911333333" },
    62: { id: LIU_YZ_ID, name: "劉宜蓁", phone: "0911444444" },
  };

  const customerData: Array<{
    id: string; storeId: string; name: string; phone: string;
    gender: string; customerStage: CustStage;
    talentStage: DemoStage; stageChangedAt: Date | null; stageNote: string | null;
    totalPoints: number; firstVisitAt: Date | null; convertedAt: Date | null;
    selfBookingEnabled: boolean; sponsorId: string | null;
  }> = [];

  for (let i = 0; i < 100; i++) {
    const stage = getStage(i);
    const points = getPoints(stage, i);
    const custStage = getCustStage(stage, i);
    const override = showcaseOverrides[i];

    const idx = String(i + 1).padStart(3, "0");
    const id = override?.id ?? `demo-cust-${idx}`;
    const name = override?.name ?? (SURNAMES[i % SURNAMES.length] + GIVEN_NAMES[i % GIVEN_NAMES.length]);
    const phone = override?.phone ?? `09${String(70000000 + i * 111).padStart(8, "0")}`;

    let sponsorId: string | null = null;
    if (stage === "POTENTIAL_PARTNER" && i % 3 === 0) {
      sponsorId = WANG_XM_ID; // 由王小明推薦
    } else if (stage === "PARTNER" && i !== 80 && i % 2 === 0) {
      sponsorId = ZHANG_XY_ID; // 由張欣怡推薦
    }

    const firstVisitDate = custStage !== "LEAD" ? new Date(2025, 10 + (i % 3), 1 + (i % 28)) : null;
    const convertedDate = custStage === "ACTIVE" ? new Date(2025, 11 + (i % 2), 1 + (i % 28)) : null;

    customerData.push({
      id, storeId: STORE_ID, name, phone,
      gender: (i % 10) < 5 ? "female" : "male",
      customerStage: custStage,
      talentStage: stage,
      stageChangedAt: getStageChangedAt(stage, i),
      stageNote: stageNotes[stage],
      totalPoints: points,
      firstVisitAt: firstVisitDate,
      convertedAt: convertedDate,
      selfBookingEnabled: custStage === "ACTIVE",
      sponsorId: null, // 先建立，稍後設定 sponsor
    });
  }

  await prisma.customer.createMany({ data: customerData });
  console.log("   100 位 Demo 顧客建立完成");

  // 設定 sponsorId（需先建好顧客才能引用）
  for (let i = 0; i < 100; i++) {
    const stage = getStage(i);
    const override = showcaseOverrides[i];
    const id = override?.id ?? `demo-cust-${String(i + 1).padStart(3, "0")}`;

    let sponsorId: string | null = null;
    if (stage === "POTENTIAL_PARTNER" && i % 3 === 0) sponsorId = WANG_XM_ID;
    else if (stage === "PARTNER" && i !== 80 && i % 2 === 0) sponsorId = ZHANG_XY_ID;

    if (sponsorId) {
      await prisma.customer.update({ where: { id }, data: { sponsorId } });
    }
  }
  console.log("   推薦人關係設定完成");

  // ============================================================
  // Step 3: 轉介紹紀錄
  // ============================================================
  console.log("\n3. 建立轉介紹紀錄...");

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
  const referralData: Array<{
    storeId: string; referrerId: string; referredName: string;
    referredPhone: string; status: "PENDING" | "VISITED" | "CONVERTED";
    convertedCustomerId: string | null; note: string; createdAt: Date;
  }> = [];
  let refIdx = 0;

  for (let i = 60; i < 100; i++) {
    const stage = getStage(i);
    const override = showcaseOverrides[i];
    const referrerId = override?.id ?? `demo-cust-${String(i + 1).padStart(3, "0")}`;
    const refCount = stage === "OWNER" ? 5 : stage === "FUTURE_OWNER" ? 4 : stage === "PARTNER" ? 3 : 2;

    for (let r = 0; r < refCount; r++) {
      const status = statuses[(refIdx + r) % 3];
      const convertedId = status === "CONVERTED" && refIdx < 35
        ? `demo-cust-${String(refIdx + 1).padStart(3, "0")}`
        : null;

      referralData.push({
        storeId: STORE_ID,
        referrerId,
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

  await prisma.referral.createMany({ data: referralData });
  console.log(`   ${referralData.length} 筆轉介紹建立完成`);

  // ============================================================
  // Step 4: 積分紀錄
  // ============================================================
  console.log("\n4. 建立積分紀錄...");

  type PType = "REFERRAL_CREATED" | "REFERRAL_CONVERTED" | "REFERRAL_VISITED" | "ATTENDANCE" | "BECAME_PARTNER" | "BECAME_FUTURE_OWNER" | "SERVICE";
  const pointData: Array<{
    customerId: string; storeId: string; type: PType; points: number; note: string; createdAt: Date;
  }> = [];

  for (let i = 0; i < 100; i++) {
    const stage = getStage(i);
    const override = showcaseOverrides[i];
    const custId = override?.id ?? `demo-cust-${String(i + 1).padStart(3, "0")}`;

    const attCount = stage === "CUSTOMER" ? (i % 3)
      : stage === "REGULAR" ? 3 + (i % 5)
      : stage === "POTENTIAL_PARTNER" ? 5 + (i % 4)
      : stage === "PARTNER" ? 8 + (i % 5)
      : stage === "FUTURE_OWNER" ? 10 + (i % 4)
      : 12 + (i % 3);

    for (let a = 0; a < attCount; a++) {
      pointData.push({
        customerId: custId, storeId: STORE_ID, type: "ATTENDANCE",
        points: 5, note: `出席 #${a + 1}`,
        createdAt: new Date(2026, Math.floor(a / 4), 1 + ((a * 7 + i) % 28)),
      });
    }

    if (i >= 60) {
      const refCount = stage === "OWNER" ? 5 : stage === "FUTURE_OWNER" ? 4 : stage === "PARTNER" ? 3 : 2;
      for (let r = 0; r < refCount; r++) {
        pointData.push({ customerId: custId, storeId: STORE_ID, type: "REFERRAL_CREATED", points: 10, note: `介紹朋友 #${r + 1}`, createdAt: new Date(2026, 1 + (r % 3), 5 + r * 3) });
        if (r % 2 === 0) pointData.push({ customerId: custId, storeId: STORE_ID, type: "REFERRAL_VISITED", points: 20, note: `朋友到店 #${r + 1}`, createdAt: new Date(2026, 1 + (r % 3), 10 + r * 3) });
        if (r % 3 === 0) pointData.push({ customerId: custId, storeId: STORE_ID, type: "REFERRAL_CONVERTED", points: 30, note: `朋友轉換 #${r + 1}`, createdAt: new Date(2026, 1 + (r % 3), 15 + r * 3) });
      }
    }

    if (stage === "PARTNER" || stage === "FUTURE_OWNER" || stage === "OWNER") {
      pointData.push({ customerId: custId, storeId: STORE_ID, type: "BECAME_PARTNER", points: 100, note: "升為合作店長", createdAt: new Date(2026, 1, 1 + (i % 28)) });
    }
    if (stage === "FUTURE_OWNER" || stage === "OWNER") {
      pointData.push({ customerId: custId, storeId: STORE_ID, type: "BECAME_FUTURE_OWNER", points: 200, note: "升為準店長", createdAt: new Date(2026, 2, 1 + (i % 28)) });
    }
  }

  await prisma.pointRecord.createMany({ data: pointData });
  console.log(`   ${pointData.length} 筆積分紀錄建立完成`);

  // ============================================================
  // Step 5: 人才階段晉升 Log
  // ============================================================
  console.log("\n5. 建立階段晉升 Log...");

  const progression: DemoStage[] = ["CUSTOMER", "REGULAR", "POTENTIAL_PARTNER", "PARTNER", "FUTURE_OWNER", "OWNER"];
  const logData: Array<{
    customerId: string; storeId: string; fromStage: DemoStage; toStage: DemoStage;
    changedById: string; note: string; createdAt: Date;
  }> = [];

  for (let i = 35; i < 100; i++) {
    const finalStage = getStage(i);
    const finalIdx = progression.indexOf(finalStage);
    const override = showcaseOverrides[i];
    const custId = override?.id ?? `demo-cust-${String(i + 1).padStart(3, "0")}`;

    for (let s = 0; s < finalIdx; s++) {
      logData.push({
        customerId: custId, storeId: STORE_ID,
        fromStage: progression[s], toStage: progression[s + 1],
        changedById: ownerUser.id,
        note: `階段晉升 → ${progression[s + 1]}`,
        createdAt: new Date(2026, s, 10 + (i % 20)),
      });
    }
  }

  await prisma.talentStageLog.createMany({ data: logData });
  console.log(`   ${logData.length} 筆晉升 Log 建立完成`);

  // ============================================================
  // Step 6: 展示主角補強（Readiness Boost）
  // ============================================================
  console.log("\n6. 展示主角補強...");

  const staffId = ownerStaff.id;

  // ── 王小明：PARTNER → READY (score ≥ 80) ──
  console.log("   王小明 → READY...");

  // 50 筆 COMPLETED bookings（attendance 高分）
  const wangBookings = [];
  for (let i = 0; i < 50; i++) {
    wangBookings.push({
      customerId: WANG_XM_ID, storeId: STORE_ID,
      bookingDate: dateAt(7 + i * 7), slotTime: "10:00",
      revenueStaffId: staffId, bookedByType: "STAFF" as const,
      bookedByStaffId: staffId, bookingType: "PACKAGE_SESSION" as const,
      bookingStatus: "COMPLETED" as const,
    });
  }
  await prisma.booking.createMany({ data: wangBookings });

  // stageChangedAt 360 天前（timeScore = 25）
  await prisma.customer.update({
    where: { id: WANG_XM_ID },
    data: {
      stageChangedAt: dateAt(360),
      totalPoints: 215,
      stageNote: "已正式成為合作店長，長期穩定推薦",
    },
  });

  // 額外 3 筆 CONVERTED referrals（referralScore 拉滿）
  for (let i = 0; i < 3; i++) {
    await prisma.referral.create({
      data: {
        storeId: STORE_ID, referrerId: WANG_XM_ID,
        referredName: `友人${String.fromCharCode(65 + i)}`,
        referredPhone: `0977${i}11111`,
        status: "CONVERTED",
        note: "王小明長期推薦的朋友",
        createdAt: dateAt(30 + i * 20),
      },
    });
  }

  // 帶出人：把 2 個 sponsored customer 升 PARTNER
  const wangSponsored = await prisma.customer.findMany({
    where: { sponsorId: WANG_XM_ID, id: { not: WANG_XM_ID } },
    take: 2,
  });
  for (const c of wangSponsored) {
    await prisma.customer.update({
      where: { id: c.id },
      data: { talentStage: "PARTNER", stageChangedAt: dateAt(30), stageNote: "由王小明帶出" },
    });
    await prisma.talentStageLog.create({
      data: {
        customerId: c.id, storeId: STORE_ID,
        fromStage: c.talentStage, toStage: "PARTNER",
        changedById: ownerUser.id, note: "王小明帶出，成為合作店長",
        createdAt: dateAt(30),
      },
    });
  }
  console.log("   +50 bookings, +3 referrals, 帶出 2 人");

  // ── 張欣怡：FUTURE_OWNER → HIGH (score ≥ 56) ──
  console.log("   張欣怡 → HIGH...");

  const zhangBookings = [];
  for (let i = 0; i < 30; i++) {
    zhangBookings.push({
      customerId: ZHANG_XY_ID, storeId: STORE_ID,
      bookingDate: dateAt(7 + i * 7), slotTime: "14:00",
      revenueStaffId: staffId, bookedByType: "STAFF" as const,
      bookedByStaffId: staffId, bookingType: "PACKAGE_SESSION" as const,
      bookingStatus: "COMPLETED" as const,
    });
  }
  await prisma.booking.createMany({ data: zhangBookings });

  await prisma.customer.update({
    where: { id: ZHANG_XY_ID },
    data: {
      stageChangedAt: dateAt(240),
      totalPoints: 280,
      stageNote: "積極籌備中，即將開店",
    },
  });

  // 帶出 1 人
  const zhangSponsored = await prisma.customer.findMany({
    where: { sponsorId: ZHANG_XY_ID, id: { not: ZHANG_XY_ID } },
    take: 1,
  });
  for (const c of zhangSponsored) {
    await prisma.customer.update({
      where: { id: c.id },
      data: { talentStage: "PARTNER", stageChangedAt: dateAt(15), stageNote: "由張欣怡帶出" },
    });
    await prisma.talentStageLog.create({
      data: {
        customerId: c.id, storeId: STORE_ID,
        fromStage: c.talentStage, toStage: "PARTNER",
        changedById: ownerUser.id, note: "張欣怡帶出，成為合作店長",
        createdAt: dateAt(15),
      },
    });
  }
  console.log("   +30 bookings, stageChangedAt 240d, 帶出 1 人");

  // ── 劉宜蓁：POTENTIAL_PARTNER → HIGH (score ≥ 56) ──
  console.log("   劉宜蓁 → HIGH...");

  // 30 筆 COMPLETED bookings → attendanceScore = 15
  const liuBookings = [];
  for (let i = 0; i < 30; i++) {
    liuBookings.push({
      customerId: LIU_YZ_ID, storeId: STORE_ID,
      bookingDate: dateAt(7 + i * 7), slotTime: "16:00",
      revenueStaffId: staffId, bookedByType: "STAFF" as const,
      bookedByStaffId: staffId, bookingType: "PACKAGE_SESSION" as const,
      bookingStatus: "COMPLETED" as const,
    });
  }
  await prisma.booking.createMany({ data: liuBookings });

  // stageChangedAt 240 天前 → timeScore = 20
  await prisma.customer.update({
    where: { id: LIU_YZ_ID },
    data: {
      stageChangedAt: dateAt(240),
      totalPoints: 85,
      stageNote: "培養池代表人物，持續觀察中",
    },
  });

  // 額外 2 筆 CONVERTED referrals → referralScore = 15 (3*5)
  for (let i = 0; i < 2; i++) {
    await prisma.referral.create({
      data: {
        storeId: STORE_ID, referrerId: LIU_YZ_ID,
        referredName: `友人${String.fromCharCode(88 + i)}`,
        referredPhone: `0988${i}22222`,
        status: "CONVERTED",
        note: "劉宜蓁推薦的朋友",
        createdAt: dateAt(40 + i * 15),
      },
    });
  }
  // 預估: ref=15 att=15 rate=25 time=20 → 75 HIGH ✓
  console.log("   +30 bookings, +2 referrals, stageChangedAt 240d");

  // ============================================================
  // Step 7: 驗證
  // ============================================================
  console.log("\n7. 驗證展示主角...");

  for (const { name, id } of [
    { name: "王小明", id: WANG_XM_ID },
    { name: "張欣怡", id: ZHANG_XY_ID },
    { name: "劉宜蓁", id: LIU_YZ_ID },
  ]) {
    const c = await prisma.customer.findUnique({
      where: { id },
      select: { talentStage: true, totalPoints: true, stageChangedAt: true },
    });
    if (!c) { console.log(`   ❌ ${name} 不存在！`); continue; }

    const sponsorCount = await prisma.customer.count({ where: { sponsorId: id } });
    const refCount = await prisma.referral.count({
      where: { referrerId: id, storeId: STORE_ID, status: { in: ["VISITED", "CONVERTED"] } },
    });
    const completed = await prisma.booking.count({
      where: { customerId: id, storeId: STORE_ID, bookingStatus: "COMPLETED" },
    });
    const noShow = await prisma.booking.count({
      where: { customerId: id, storeId: STORE_ID, bookingStatus: "NO_SHOW" },
    });
    const rate = completed + noShow > 0 ? completed / (completed + noShow) : 0;
    const daysInStage = c.stageChangedAt
      ? Math.floor((new Date("2026-04-14").getTime() - c.stageChangedAt.getTime()) / 86400000)
      : 0;

    const referralScore = Math.min(Math.max(sponsorCount, refCount) * 5, 25);
    const attendanceScore = Math.min(Math.floor(completed / 2), 25);
    const attendanceRateScore = Math.round(rate * 25);
    const timeScore = Math.min(Math.floor(daysInStage / 12), 25);
    const total = referralScore + attendanceScore + attendanceRateScore + timeScore;
    const level = total >= 80 ? "READY" : total >= 56 ? "HIGH" : total >= 31 ? "MEDIUM" : "LOW";
    const mentored = await prisma.customer.count({
      where: { sponsorId: id, talentStage: { in: ["PARTNER", "FUTURE_OWNER", "OWNER"] } },
    });

    console.log(`   ${name} (${c.talentStage}): ref=${referralScore} att=${attendanceScore} rate=${attendanceRateScore} time=${timeScore} → ${total} ${level} | 帶出=${mentored}`);
  }

  // ── 統計 ────
  const totalCustomers = await prisma.customer.count({ where: { id: { startsWith: "demo-cust-" } } });
  const totalReferrals = await prisma.referral.count({ where: { referrerId: { startsWith: "demo-cust-" } } });
  const totalPoints = await prisma.pointRecord.count({ where: { customerId: { startsWith: "demo-cust-" } } });
  const totalLogs = await prisma.talentStageLog.count({ where: { customerId: { startsWith: "demo-cust-" } } });

  console.log(`\n===== 完成 =====`);
  console.log(`  Demo 顧客：${totalCustomers}`);
  console.log(`  轉介紹：${totalReferrals}`);
  console.log(`  積分紀錄：${totalPoints}`);
  console.log(`  階段 Log：${totalLogs}`);
  console.log(`\n✅ Production-Safe Demo Seed 完成`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
