"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handleActionError } from "@/lib/errors";
import { requireWritablePermission } from "@/lib/permissions";
import { revalidateBusinessHours } from "@/lib/revalidation";
import { resolveWriteStoreId } from "@/lib/store";
import type { ActionResult } from "@/types";
import { requireSpaStore } from "@/lib/industry-module-server";

type ScheduleInterval = 15 | 30;

function withInterval(value: Prisma.JsonValue | null, interval: ScheduleInterval) {
  if (!Array.isArray(value)) return value ?? undefined;
  return value.map((period) =>
    period && typeof period === "object" && !Array.isArray(period)
      ? { ...period, slotInterval: interval }
      : period,
  ) as Prisma.InputJsonValue;
}

/** SPA 工作台專用：直接切換目前門市的預約起始時間密度。 */
export async function updateSpaScheduleInterval(
  interval: ScheduleInterval,
): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    await requireSpaStore(storeId);

    if (interval !== 15 && interval !== 30) {
      return { success: false, error: "時間單位只能設為 15 或 30 分鐘" };
    }

    const [weeklyRules, customDays] = await Promise.all([
      prisma.businessHours.findMany({ where: { storeId } }),
      prisma.specialBusinessDay.findMany({
        where: { storeId, type: "custom" },
      }),
    ]);

    await prisma.$transaction([
      ...weeklyRules.map((rule) =>
        prisma.businessHours.update({
          where: { id: rule.id },
          data: {
            slotInterval: interval,
            segments: withInterval(rule.segments, interval),
          },
        }),
      ),
      ...customDays.map((day) =>
        prisma.specialBusinessDay.update({
          where: { id: day.id },
          data: {
            slotInterval: interval,
            segments: withInterval(day.segments, interval),
          },
        }),
      ),
    ]);

    revalidateBusinessHours();
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}
