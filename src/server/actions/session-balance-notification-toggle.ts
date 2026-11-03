"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING } from "@/lib/session-balance-notification-settings";
import { handleActionError } from "@/lib/errors";

export async function setSessionBalanceNotificationToggle(input: unknown) {
  try {
    const { key, enabled } = z.object({ key: z.enum(["lastSessionEnabled", "planUsedUpEnabled"]), enabled: z.boolean() }).parse(input);
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} FOR UPDATE`;
      const current = await tx.sessionBalanceNotificationSetting.findUnique({ where: { storeId } }) ?? DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING;
      const next = { lastSessionEnabled: current.lastSessionEnabled, planUsedUpEnabled: current.planUsedUpEnabled, [key]: enabled };
      await tx.sessionBalanceNotificationSetting.upsert({
        where: { storeId },
        create: { storeId, ...DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING, ...next, isEnabled: next.lastSessionEnabled || next.planUsedUpEnabled },
        update: { [key]: enabled, isEnabled: next.lastSessionEnabled || next.planUsedUpEnabled },
      });
    });
    revalidatePath("/dashboard/reminders");
    return { success: true as const };
  } catch (error) { return handleActionError(error); }
}
