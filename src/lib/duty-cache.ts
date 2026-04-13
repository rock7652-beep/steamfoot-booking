/**
 * 值班排班快取層
 *
 * businessHours（7 筆，極少變動）和 ShopConfig 使用 React cache() 做 request-level 快取，
 * 同一次 render 內多處讀取不會重複查 DB。
 *
 * 跨 request 快取使用 unstable_cache（Next.js），設定 revalidate 時間。
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type { ServerTiming } from "@/lib/perf";
import { getShopConfig, isDutySchedulingEnabled } from "@/lib/shop-config";

/**
 * request-level 快取：同一次 server render 內只查一次 businessHours
 */
export const getBusinessHoursOnce = cache(async (storeId: string) => {
  return prisma.businessHours.findMany({ where: { storeId } });
});

/**
 * request-level 快取：同一次 server render 內只查一次 ShopConfig
 */
export const getShopConfigOnce = cache(async (storeId?: string) => {
  const config = await getShopConfig(storeId);
  return config;
});

/**
 * 跨 request 快取：businessHours 很少變動（revalidate 60s）
 */
export const getCachedBusinessHours = (storeId: string) =>
  unstable_cache(
    async () => {
      const rows = await prisma.businessHours.findMany({ where: { storeId } });
      return rows.map((bh) => ({
        dayOfWeek: bh.dayOfWeek,
        isOpen: bh.isOpen,
        openTime: bh.openTime,
        closeTime: bh.closeTime,
        slotInterval: bh.slotInterval,
        defaultCapacity: bh.defaultCapacity,
      }));
    },
    [`business-hours-${storeId}`],
    { revalidate: 60, tags: ["business-hours"] }
  )();

/**
 * 跨 request 快取：某週的 specialBusinessDay（revalidate 60s）
 */
export const getCachedSpecialDays = (storeId: string, weekStartISO: string, weekEndISO: string) =>
  unstable_cache(
    async () => {
      const rows = await prisma.specialBusinessDay.findMany({
        where: {
          storeId,
          date: {
            gte: new Date(weekStartISO),
            lte: new Date(weekEndISO),
          },
        },
      });
      return rows.map((sd) => ({
        date: sd.date.toISOString().slice(0, 10),
        type: sd.type,
        reason: sd.reason,
        openTime: sd.openTime,
        closeTime: sd.closeTime,
        slotInterval: sd.slotInterval,
        defaultCapacity: sd.defaultCapacity,
      }));
    },
    [`special-days-${storeId}`, weekStartISO, weekEndISO],
    { revalidate: 60, tags: ["special-days"] }
  )();

/**
 * 跨 request 快取：dutySchedulingEnabled（revalidate 30s）
 */
export const getCachedDutyEnabled = unstable_cache(
  async (storeId?: string) => {
    return isDutySchedulingEnabled(storeId);
  },
  ["duty-scheduling-enabled"],
  { revalidate: 30, tags: ["duty-scheduling"] }
);

// ── 帶計時的包裝（供 ServerTiming 使用） ──────────────

export async function getBusinessHoursWithTiming(storeId: string, timer?: ServerTiming) {
  const t0 = performance.now();
  const result = await getCachedBusinessHours(storeId);
  const ms = performance.now() - t0;
  if (timer) {
    timer.record("getCachedBusinessHours", ms);
    timer.cacheStatus("business-hours", ms < 10 ? "hit" : "miss");
  }
  return result;
}

export async function getSpecialDaysWithTiming(
  storeId: string,
  weekStartISO: string,
  weekEndISO: string,
  timer?: ServerTiming,
) {
  const t0 = performance.now();
  const result = await getCachedSpecialDays(storeId, weekStartISO, weekEndISO);
  const ms = performance.now() - t0;
  if (timer) {
    timer.record("getCachedSpecialDays", ms);
    timer.cacheStatus("special-days", ms < 10 ? "hit" : "miss");
  }
  return result;
}

export async function getDutyEnabledWithTiming(timer?: ServerTiming) {
  const t0 = performance.now();
  const result = await getCachedDutyEnabled();
  const ms = performance.now() - t0;
  if (timer) {
    timer.record("getCachedDutyEnabled", ms);
    timer.cacheStatus("duty-scheduling", ms < 10 ? "hit" : "miss");
  }
  return result;
}
