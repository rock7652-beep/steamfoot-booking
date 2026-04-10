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

/**
 * request-level 快取：同一次 server render 內只查一次 businessHours
 */
export const getBusinessHoursOnce = cache(async () => {
  return prisma.businessHours.findMany();
});

/**
 * request-level 快取：同一次 server render 內只查一次 ShopConfig
 */
export const getShopConfigOnce = cache(async () => {
  const config = await prisma.shopConfig.findUnique({ where: { id: "default" } });
  return config ?? { dutySchedulingEnabled: false };
});

/**
 * 跨 request 快取：businessHours 很少變動（revalidate 60s）
 */
export const getCachedBusinessHours = unstable_cache(
  async () => {
    const rows = await prisma.businessHours.findMany();
    return rows.map((bh) => ({
      dayOfWeek: bh.dayOfWeek,
      isOpen: bh.isOpen,
      openTime: bh.openTime,
      closeTime: bh.closeTime,
      slotInterval: bh.slotInterval,
      defaultCapacity: bh.defaultCapacity,
    }));
  },
  ["business-hours"],
  { revalidate: 60, tags: ["business-hours"] }
);

/**
 * 跨 request 快取：某週的 specialBusinessDay（revalidate 60s）
 */
export const getCachedSpecialDays = unstable_cache(
  async (weekStartISO: string, weekEndISO: string) => {
    const rows = await prisma.specialBusinessDay.findMany({
      where: {
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
  ["special-days"],
  { revalidate: 60, tags: ["special-days"] }
);

/**
 * 跨 request 快取：dutySchedulingEnabled（revalidate 30s）
 */
export const getCachedDutyEnabled = unstable_cache(
  async () => {
    const config = await prisma.shopConfig.findUnique({
      where: { id: "default" },
      select: { dutySchedulingEnabled: true },
    });
    return config?.dutySchedulingEnabled ?? false;
  },
  ["duty-scheduling-enabled"],
  { revalidate: 30, tags: ["duty-scheduling"] }
);
