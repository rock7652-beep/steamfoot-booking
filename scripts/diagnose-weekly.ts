/**
 * 診斷腳本：檢查每週規則同步問題
 * 用法：npx tsx scripts/diagnose-weekly.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const targetDow = 2; // 週二
  const targetDate = "2026-04-21"; // 未來的週二

  console.log("=== A. BusinessHours 週二 (dayOfWeek=2) — 寫入證據 ===");
  const bh = await prisma.businessHours.findUnique({ where: { dayOfWeek: targetDow } });
  if (bh) {
    console.log(`  isOpen: ${bh.isOpen}`);
    console.log(`  openTime: ${bh.openTime}`);
    console.log(`  closeTime: ${bh.closeTime}`);
    console.log(`  slotInterval: ${bh.slotInterval}`);
    console.log(`  defaultCapacity: ${bh.defaultCapacity}`);
    console.log(`  updatedAt: ${bh.updatedAt.toISOString()}`);
  } else {
    console.log("  ❌ 不存在！");
  }

  console.log("\n=== B. SpecialBusinessDay 覆寫清理證據 ===");
  const today = new Date("2026-04-09T00:00:00Z");
  const allSpecial = await prisma.specialBusinessDay.findMany({
    where: { date: { gte: today } },
    orderBy: { date: "asc" },
  });
  const tuesdaySpecials = allSpecial.filter((s) => s.date.getUTCDay() === targetDow);
  console.log(`  未來所有 SpecialBusinessDay: ${allSpecial.length}`);
  console.log(`  其中週二: ${tuesdaySpecials.length}`);
  for (const s of tuesdaySpecials) {
    console.log(`    ${s.date.toISOString().slice(0, 10)} type=${s.type} open=${s.openTime} close=${s.closeTime}`);
  }
  if (tuesdaySpecials.length === 0) {
    console.log("  ✅ 無週二覆寫 → 查詢時應直接使用 BusinessHours");
  }

  console.log("\n=== C. 查詢結果證據 (2026-04-21) ===");

  // C1: getMonthScheduleSummary 模擬
  console.log("\n  C1. getMonthScheduleSummary 模擬:");
  const dateObj21 = new Date("2026-04-21T00:00:00Z");
  const dow21 = dateObj21.getUTCDay();
  const special21 = await prisma.specialBusinessDay.findUnique({ where: { date: dateObj21 } });
  console.log(`    dayOfWeek: ${dow21} (should be 2=Tuesday)`);
  console.log(`    SpecialBusinessDay: ${special21 ? `YES type=${special21.type}` : "null (使用 BusinessHours)"}`);
  if (!special21 && bh) {
    console.log(`    → 使用 BusinessHours: ${bh.openTime}–${bh.closeTime}, ${bh.slotInterval}min, ${bh.defaultCapacity}位`);
  }

  // C2: fetchDaySlots 模擬
  console.log("\n  C2. fetchDaySlots 模擬:");
  const bh21 = await prisma.businessHours.findUnique({ where: { dayOfWeek: dow21 } });
  const overrides21 = await prisma.slotOverride.findMany({ where: { date: dateObj21 } });
  console.log(`    BusinessHours match: ${bh21 ? `open=${bh21.openTime} close=${bh21.closeTime}` : "null"}`);
  console.log(`    SlotOverrides: ${overrides21.length}`);
  if (!special21 && bh21 && bh21.isOpen) {
    const openMin = timeToMin(bh21.openTime!);
    const closeMin = timeToMin(bh21.closeTime!);
    const slotCount = Math.floor((closeMin - openMin) / bh21.slotInterval);
    console.log(`    → 應生成 ${slotCount} 個時段 (${bh21.openTime}–${bh21.closeTime}, 每${bh21.slotInterval}分)`);
  }

  // C3: getDaySlotDetails 模擬
  console.log("\n  C3. getDaySlotDetails 模擬:");
  if (special21) {
    console.log(`    SpecialBusinessDay 存在 → status=${special21.type === "closed" ? "closed" : special21.type === "training" ? "training" : "custom"}`);
  } else if (bh21 && !bh21.isOpen) {
    console.log("    BusinessHours isOpen=false → status=closed");
  } else if (bh21) {
    console.log(`    BusinessHours isOpen=true → status=open, open=${bh21.openTime}, close=${bh21.closeTime}`);
  } else {
    console.log("    無設定 → status=closed");
  }

  console.log("\n=== D. 三者是否一致 ===");
  const effectiveOpen = special21?.openTime ?? bh?.openTime ?? null;
  const effectiveClose = special21?.closeTime ?? bh?.closeTime ?? null;
  console.log(`  有效 openTime: ${effectiveOpen}`);
  console.log(`  有效 closeTime: ${effectiveClose}`);
  console.log(`  來源: ${special21 ? "SpecialBusinessDay" : bh ? "BusinessHours" : "無"}`);
  if (!special21 && bh) {
    console.log("  ✅ 三個查詢函式應該回傳一致結果（都使用 BusinessHours）");
  } else if (special21) {
    console.log("  ⚠️  SpecialBusinessDay 存在，會覆蓋 BusinessHours");
  }

  console.log("\n=== E. 結論 ===");
  if (!special21 && bh) {
    console.log(`  DB 中 BusinessHours 週二 = ${bh.openTime}–${bh.closeTime}`);
    console.log(`  如果使用者看到的是這個值，代表 DB 寫入正確但使用者設定的值就是這個`);
    console.log(`  如果使用者看到的不是這個值，代表前端 UI 顯示了快取/舊資料`);
    console.log(`  → 問題最可能是：saveWeeklyDay 更新 DB 後未刷新 monthSummary`);
  }
}

function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
