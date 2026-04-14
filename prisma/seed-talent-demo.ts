/**
 * 人才系統 Demo 資料 — 100 位顧客 + 積分 + 推薦關係
 *
 * 執行：npx tsx prisma/seed-talent-demo.ts
 *
 * 注意：此腳本「追加」資料，不會清除現有資料。
 * 若需重新建立，先手動刪除 phone LIKE '09%00%' 的 demo 顧客。
 */

import { PrismaClient, PointType, TalentStage, ReferralStatus } from "@prisma/client";

const prisma = new PrismaClient();

// ── 姓名池 ──────────────────────────────────────────────
const SURNAMES = [
  "林", "黃", "張", "李", "王", "吳", "劉", "蔡", "陳", "楊",
  "許", "鄭", "謝", "郭", "洪", "曾", "邱", "廖", "賴", "周",
  "徐", "蘇", "葉", "莊", "呂", "江", "何", "蕭", "羅", "高",
];
const GIVEN_NAMES = [
  "雅婷", "怡君", "欣怡", "美玲", "淑芬", "佳穎", "宜蓁", "玉華", "家豪", "建宏",
  "志明", "俊傑", "宗翰", "冠宇", "柏翰", "彥廷", "承恩", "品萱", "詩涵", "雨萱",
  "子晴", "宥辰", "宇恩", "芷瑜", "昀蓁", "心妍", "語彤", "筱涵", "佳蓉", "思妤",
  "沛霖", "晨曦", "庭瑜", "宥翔", "睿恩", "柏宇", "承翰", "品叡", "宸瑋", "昕蕾",
];

function pickName(i: number): string {
  return SURNAMES[i % SURNAMES.length] + GIVEN_NAMES[i % GIVEN_NAMES.length];
}

function phone(i: number): string {
  return `09${String(i).padStart(4, "0")}00${String(Math.floor(i / 100)).padStart(2, "0")}`;
}

function daysAgo(n: number): Date {
  const d = new Date("2026-04-14T10:00:00+08:00");
  d.setDate(d.getDate() - n);
  return d;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── 積分紀錄產生器 ─────────────────────────────────────
interface PointDef {
  type: PointType;
  points: number;
  note: string;
}

const POINT_TEMPLATES: PointDef[] = [
  { type: "ATTENDANCE", points: 5, note: "出席蒸足體驗" },
  { type: "ATTENDANCE", points: 5, note: "到店簽到" },
  { type: "ATTENDANCE", points: 5, note: "完成療程" },
  { type: "REFERRAL_CREATED", points: 10, note: "推薦朋友" },
  { type: "REFERRAL_VISITED", points: 20, note: "朋友到店體驗" },
  { type: "REFERRAL_CONVERTED", points: 30, note: "朋友成為顧客" },
];

function generatePointRecords(
  customerId: string,
  targetPoints: number,
  count: number,
  startDaysAgo: number,
): { records: Omit<(typeof POINT_TEMPLATES)[0] & { customerId: string; storeId: string; createdAt: Date }, never>[]; actualTotal: number } {
  const records: { customerId: string; storeId: string; type: PointType; points: number; note: string; createdAt: Date }[] = [];
  let remaining = targetPoints;

  for (let j = 0; j < count && remaining > 0; j++) {
    const dayOffset = Math.floor((startDaysAgo / count) * (count - j));
    let template: PointDef;

    if (remaining >= 30 && Math.random() < 0.15) {
      template = POINT_TEMPLATES.find((t) => t.type === "REFERRAL_CONVERTED")!;
    } else if (remaining >= 20 && Math.random() < 0.2) {
      template = POINT_TEMPLATES.find((t) => t.type === "REFERRAL_VISITED")!;
    } else if (remaining >= 10 && Math.random() < 0.25) {
      template = POINT_TEMPLATES.find((t) => t.type === "REFERRAL_CREATED")!;
    } else if (remaining >= 5) {
      template = pickRandom(POINT_TEMPLATES.filter((t) => t.points <= remaining && t.points <= 10));
    } else {
      template = { type: "ATTENDANCE", points: remaining, note: "出席回饋" };
    }

    const pts = Math.min(template.points, remaining);
    records.push({
      customerId,
      storeId: "default-store",
      type: template.type,
      points: pts,
      note: template.note,
      createdAt: daysAgo(dayOffset),
    });
    remaining -= pts;
  }

  return { records, actualTotal: targetPoints - remaining };
}

// ── 主程式 ─────────────────────────────────────────────
async function main() {
  console.log("=== 人才系統 Demo 資料建立 ===\n");

  // 取得 owner user（用於 TalentStageLog changedById）
  const ownerUser = await prisma.user.findFirst({
    where: { role: "ADMIN", staff: { storeId: "default-store" } },
  });
  if (!ownerUser) {
    console.error("找不到 ADMIN 使用者，請先執行 prisma/seed.ts");
    process.exit(1);
  }

  // 定義 4 個分層
  interface Tier {
    label: string;
    count: number;
    pointsRange: [number, number];
    talentStages: TalentStage[];
    lastVisitDaysAgo: [number, number];
    pointRecordCount: [number, number];
  }

  const tiers: Tier[] = [
    {
      label: "高潛力",
      count: 10,
      pointsRange: [120, 250],
      talentStages: ["POTENTIAL_PARTNER", "FUTURE_OWNER"],
      lastVisitDaysAgo: [0, 7],
      pointRecordCount: [7, 10],
    },
    {
      label: "成長中",
      count: 20,
      pointsRange: [40, 100],
      talentStages: ["REGULAR", "POTENTIAL_PARTNER"],
      lastVisitDaysAgo: [3, 21],
      pointRecordCount: [5, 8],
    },
    {
      label: "穩定客",
      count: 40,
      pointsRange: [10, 40],
      talentStages: ["REGULAR", "CUSTOMER"],
      lastVisitDaysAgo: [7, 45],
      pointRecordCount: [3, 6],
    },
    {
      label: "低活躍",
      count: 30,
      pointsRange: [0, 15],
      talentStages: ["CUSTOMER"],
      lastVisitDaysAgo: [30, 120],
      pointRecordCount: [3, 4],
    },
  ];

  const allCustomerIds: string[] = [];
  const highPotentialIds: string[] = [];
  let totalPointRecords = 0;
  let customerIndex = 0;

  for (const tier of tiers) {
    console.log(`建立 ${tier.label} ${tier.count} 人...`);

    for (let i = 0; i < tier.count; i++) {
      const idx = customerIndex++;
      const name = pickName(idx);
      const lastVisitDays = randomBetween(...tier.lastVisitDaysAgo);
      const targetPoints = randomBetween(...tier.pointsRange);
      const recordCount = randomBetween(...tier.pointRecordCount);
      const talentStage = pickRandom(tier.talentStages);

      // 建立顧客
      const customer = await prisma.customer.create({
        data: {
          storeId: "default-store",
          name,
          phone: phone(idx),
          customerStage: "ACTIVE",
          talentStage,
          stageChangedAt: daysAgo(randomBetween(10, 60)),
          lastVisitAt: daysAgo(lastVisitDays),
          firstVisitAt: daysAgo(randomBetween(60, 180)),
          totalPoints: 0, // 稍後更新
        },
      });

      allCustomerIds.push(customer.id);
      if (tier.label === "高潛力") {
        highPotentialIds.push(customer.id);
      }

      // 建立積分紀錄
      const { records, actualTotal } = generatePointRecords(
        customer.id,
        targetPoints,
        recordCount,
        randomBetween(30, 150),
      );

      if (records.length > 0) {
        await prisma.pointRecord.createMany({ data: records });
        totalPointRecords += records.length;
      }

      // 更新 totalPoints 快取
      await prisma.customer.update({
        where: { id: customer.id },
        data: { totalPoints: actualTotal },
      });

      // 高潛力和成長中建立 TalentStageLog
      if (talentStage !== "CUSTOMER") {
        const logs: { customerId: string; storeId: string; fromStage: TalentStage; toStage: TalentStage; changedById: string; note: string; createdAt: Date }[] = [
          {
            customerId: customer.id,
            storeId: "default-store",
            fromStage: "CUSTOMER",
            toStage: "REGULAR",
            changedById: ownerUser.id,
            note: "穩定回訪",
            createdAt: daysAgo(randomBetween(40, 90)),
          },
        ];

        if (talentStage === "POTENTIAL_PARTNER" || talentStage === "FUTURE_OWNER") {
          logs.push({
            customerId: customer.id,
            storeId: "default-store",
            fromStage: "REGULAR",
            toStage: "POTENTIAL_PARTNER",
            changedById: ownerUser.id,
            note: "積極推薦、有合作意願",
            createdAt: daysAgo(randomBetween(15, 39)),
          });
        }

        if (talentStage === "FUTURE_OWNER") {
          logs.push({
            customerId: customer.id,
            storeId: "default-store",
            fromStage: "POTENTIAL_PARTNER",
            toStage: "FUTURE_OWNER",
            changedById: ownerUser.id,
            note: "準備開店中",
            createdAt: daysAgo(randomBetween(1, 14)),
          });
        }

        await prisma.talentStageLog.createMany({ data: logs });
      }
    }
  }

  console.log(`\n顧客建立完成：${allCustomerIds.length} 人`);
  console.log(`積分紀錄建立完成：${totalPointRecords} 筆`);

  // ── 推薦關係（sponsorId + Referral 紀錄）──────────────
  console.log("\n建立推薦關係...");

  let referralCount = 0;

  // 高潛力者各推薦 2-5 人
  for (const sponsorId of highPotentialIds) {
    const numReferrals = randomBetween(2, 5);
    // 從非高潛力中隨機選被推薦人
    const candidates = allCustomerIds.filter(
      (id) => !highPotentialIds.includes(id) && id !== sponsorId,
    );

    for (let r = 0; r < numReferrals && candidates.length > 0; r++) {
      const pickIdx = randomBetween(0, candidates.length - 1);
      const referredId = candidates.splice(pickIdx, 1)[0];

      // 設定 sponsorId
      await prisma.customer.update({
        where: { id: referredId },
        data: { sponsorId },
      });

      // 取被推薦人姓名
      const referred = await prisma.customer.findUnique({
        where: { id: referredId },
        select: { name: true, phone: true },
      });

      // 建立 Referral 紀錄
      const statuses: ReferralStatus[] = ["CONVERTED", "VISITED", "PENDING"];
      const status = pickRandom(statuses);

      await prisma.referral.create({
        data: {
          storeId: "default-store",
          referrerId: sponsorId,
          referredName: referred!.name,
          referredPhone: referred!.phone,
          status,
          convertedCustomerId: status === "CONVERTED" ? referredId : undefined,
          note: `推薦人帶來的朋友`,
          createdAt: daysAgo(randomBetween(1, 60)),
        },
      });

      referralCount++;
    }
  }

  // 成長中也隨機推薦一些
  const growthIds = allCustomerIds.slice(10, 30); // index 10-29 = 成長中
  const remainingCandidates = allCustomerIds.filter(
    (id) => !highPotentialIds.includes(id) && !growthIds.includes(id),
  );

  for (let g = 0; g < 8 && remainingCandidates.length > 0; g++) {
    const sponsorId = growthIds[g];
    const pickIdx = randomBetween(0, remainingCandidates.length - 1);
    const referredId = remainingCandidates.splice(pickIdx, 1)[0];

    await prisma.customer.update({
      where: { id: referredId },
      data: { sponsorId },
    });

    const referred = await prisma.customer.findUnique({
      where: { id: referredId },
      select: { name: true, phone: true },
    });

    await prisma.referral.create({
      data: {
        storeId: "default-store",
        referrerId: sponsorId,
        referredName: referred!.name,
        referredPhone: referred!.phone,
        status: pickRandom(["CONVERTED", "VISITED"] as ReferralStatus[]),
        convertedCustomerId: undefined,
        note: "朋友介紹",
        createdAt: daysAgo(randomBetween(5, 45)),
      },
    });

    referralCount++;
  }

  console.log(`推薦關係建立完成：${referralCount} 筆`);

  // ── 統計 ─────────────────────────────────────────────
  const topCustomers = await prisma.customer.findMany({
    where: { storeId: "default-store", totalPoints: { gt: 0 } },
    orderBy: { totalPoints: "desc" },
    take: 10,
    select: { name: true, totalPoints: true, talentStage: true },
  });

  console.log("\n=== TOP 10 積分排行 ===");
  topCustomers.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} — ${c.totalPoints} 分 (${c.talentStage})`);
  });

  const totalCustomers = await prisma.customer.count({ where: { storeId: "default-store" } });
  const totalReferrals = await prisma.referral.count({ where: { storeId: "default-store" } });
  const totalPoints = await prisma.pointRecord.count({ where: { storeId: "default-store" } });

  console.log(`\n=== 總計 ===`);
  console.log(`  顧客：${totalCustomers}`);
  console.log(`  推薦紀錄：${totalReferrals}`);
  console.log(`  積分紀錄：${totalPoints}`);
  console.log("\n✅ Demo 資料建立完成");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
