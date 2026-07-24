"use server";

import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getLineBotInfo } from "@/lib/line";
import { getLineConfigForStore } from "@/lib/line-config";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import type { ActionResult } from "@/types";

const TAICHUNG_STORE_SLUG = "taichung";

export type TaichungLineBotHealth = {
  status: "PASS" | "FAIL";
  code: string;
  displayName: string | null;
  basicId: string | null;
  matchesTaichungStore: boolean;
  repairedDestination: boolean;
  checkedAt: string;
};

/**
 * Verify the Taichung OA and repair only its stored bot destination when the
 * Production token proves that it belongs to the explicitly approved Basic ID.
 * It never sends a LINE message or touches customer data.
 */
export async function checkTaichungLineBotHealth(): Promise<ActionResult<TaichungLineBotHealth>> {
  try {
    // Existing dashboard/settings permission, plus the stricter role gate below.
    const user = await requirePermission("business_hours.manage");
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "僅限 OWNER 或 ADMIN 可以執行此檢查");
    }

    const activeStoreId = await getActiveStoreForRead(user);
    if (!activeStoreId) {
      throw new AppError("FORBIDDEN", "請先切換至台中店後再執行檢查");
    }
    await requireStoreFeature(activeStoreId, FEATURES.LINE_REMINDER);
    const store = await prisma.store.findUnique({
      where: { id: activeStoreId },
      select: { slug: true, lineDestination: true },
    });
    if (store?.slug !== TAICHUNG_STORE_SLUG) {
      throw new AppError("FORBIDDEN", "請先切換至台中店後再執行檢查");
    }
    const checkedAt = new Date().toISOString();

    // Use the same DB store id that the reminder send path passes to LINE.
    // This prevents the health check from validating a slug token that sends
    // would not actually resolve for the active store.
    const result = await getLineBotInfo(activeStoreId);
    if (!result.ok) {
      return { success: true, data: { status: "FAIL", code: result.code, displayName: null, basicId: null, matchesTaichungStore: false, repairedDestination: false, checkedAt } };
    }

    const expectedBasicId = getLineConfigForStore(activeStoreId).expectedBasicId;
    if (!expectedBasicId || result.data.basicId !== expectedBasicId) {
      return {
        success: true,
        data: {
          status: "FAIL",
          code: "BOT_BASIC_ID_MISMATCH",
          displayName: result.data.displayName,
          basicId: result.data.basicId,
          matchesTaichungStore: false,
          repairedDestination: false,
          checkedAt,
        },
      };
    }

    const repairedDestination = result.data.userId !== store.lineDestination;
    if (repairedDestination) {
      await prisma.store.update({
        where: { id: activeStoreId },
        data: { lineDestination: result.data.userId },
      });
    }

    return {
      success: true,
      data: {
        status: "PASS",
        code: repairedDestination ? "BOT_DESTINATION_REPAIRED" : "BOT_IDENTITY_MATCH",
        displayName: result.data.displayName,
        basicId: result.data.basicId,
        matchesTaichungStore: true,
        repairedDestination,
        checkedAt,
      },
    };
  } catch (error) {
    return handleActionError(error);
  }
}
