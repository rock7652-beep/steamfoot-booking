/**
 * 驗收腳本：zhubei 2026/5 後台與前台 resolver 同源
 *
 * 不修改任何資料；僅查詢並列出每天的：
 *   - 後台 getMonthScheduleSummary 計算的 status / openTime / closeTime
 *   - 前台 fetchMonthAvailability 計算的 totalCapacity / slot 數
 *   - 兩者是否一致（resolver 共用，狀態必須對齊）
 *
 * 用法：npx tsx scripts/verify-bh-sync.ts
 */

import { prisma } from "../src/lib/db";
import {
  applySlotOverrides,
  enumerateMonthDates,
  loadMonthBusinessHoursContext,
} from "../src/lib/business-hours-resolver";
import { isDutySchedulingEnabled } from "../src/lib/shop-config";

const SLUG = "zhubei";
const YEAR = 2026;
const MONTH = 5;

async function main() {
  const store = await prisma.store.findUnique({ where: { slug: SLUG } });
  if (!store) throw new Error(`store with slug=${SLUG} not found`);
  console.log(`[verify] store=${store.name} (${store.id})  ${YEAR}-${String(MONTH).padStart(2, "0")}`);

  const dutyEnabled = await isDutySchedulingEnabled(store.id);
  console.log(`[verify] isDutySchedulingEnabled(${store.id}) = ${dutyEnabled}`);

  const ctx = await loadMonthBusinessHoursContext(store.id, YEAR, MONTH);

  // duty assignment（已加 storeId 過濾）
  const dutyRows = dutyEnabled
    ? await prisma.dutyAssignment.findMany({
        where: { storeId: store.id, date: { gte: ctx.start, lte: ctx.end } },
        select: { date: true, slotTime: true },
        distinct: ["date", "slotTime"],
      })
    : [];
  const dutyKeys = new Set(
    dutyRows.map((d) => `${d.date.toISOString().slice(0, 10)}|${d.slotTime}`),
  );

  // 後台 summary
  const overrideCounts = new Map<string, number>();
  for (const o of ctx.slotOverrides) {
    const k = o.date.toISOString().slice(0, 10);
    overrideCounts.set(k, (overrideCounts.get(k) ?? 0) + 1);
  }

  let mismatch = 0;
  console.log(
    "date       | back: status   open  close | front: cap slots | duty filter | match",
  );
  console.log("-".repeat(90));

  for (const { dateStr } of enumerateMonthDates(YEAR, MONTH)) {
    const rule = ctx.rules.get(dateStr)!;
    const slots = applySlotOverrides(rule, ctx.slotOverrides.filter((o) => o.date.toISOString().slice(0, 10) === dateStr));
    const enabled = slots.filter((s) => s.isEnabled);
    let frontCap = enabled.reduce((a, s) => a + s.capacity, 0);
    let frontSlots = enabled.length;
    if (dutyEnabled) {
      const filtered = enabled.filter((s) => dutyKeys.has(`${dateStr}|${s.startTime}`));
      frontCap = filtered.reduce((a, s) => a + s.capacity, 0);
      frontSlots = filtered.length;
    }

    // 後台月曆顯示「公休」 ⇔ rule.closed
    // 前台月曆顯示「公休」 ⇔ frontCap === 0
    const backIsClosedForUI = rule.closed;
    const frontIsClosedForUI = frontCap === 0;
    const matches = backIsClosedForUI === frontIsClosedForUI;
    if (!matches) mismatch++;

    console.log(
      `${dateStr} | ${rule.status.padEnd(8)} ${(rule.openTime ?? "  -  ").padEnd(5)} ${(rule.closeTime ?? "  -  ").padEnd(5)} | ${String(frontCap).padStart(3)} ${String(frontSlots).padStart(2)}slots | ${dutyEnabled ? "ON" : "off"}        | ${matches ? "✓" : "✗ MISMATCH"}`,
    );
  }

  console.log("-".repeat(90));
  if (mismatch === 0) {
    console.log("[verify] PASS: 後台/前台月曆「公休/營業」狀態 100% 一致 (31/31)");
  } else {
    console.log(`[verify] FAIL: ${mismatch} 天不一致`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
