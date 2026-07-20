"use server";

import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { getLineBotInfo } from "@/lib/line";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import type { ActionResult } from "@/types";

const TAICHUNG_STORE_ID = "store-taichung";

export type TaichungLineBotHealth = {
  status: "PASS" | "FAIL";
  code: string;
  displayName: string | null;
  basicId: string | null;
  matchesTaichungStore: boolean;
  checkedAt: string;
};

/** Read-only OA identity check. It never sends a LINE message or writes data. */
export async function checkTaichungLineBotHealth(): Promise<ActionResult<TaichungLineBotHealth>> {
  try {
    // Existing dashboard/settings permission, plus the stricter role gate below.
    const user = await requirePermission("business_hours.manage");
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "僅限 OWNER 或 ADMIN 可以執行此檢查");
    }

    const activeStoreId = await getActiveStoreForRead(user);
    if (activeStoreId !== TAICHUNG_STORE_ID) {
      throw new AppError("FORBIDDEN", "請先切換至台中店後再執行檢查");
    }

    const store = await prisma.store.findUnique({
      where: { id: TAICHUNG_STORE_ID },
      select: { lineDestination: true },
    });
    const checkedAt = new Date().toISOString();
    if (!store?.lineDestination) {
      return { success: true, data: { status: "FAIL", code: "STORE_DESTINATION_MISSING", displayName: null, basicId: null, matchesTaichungStore: false, checkedAt } };
    }

    const result = await getLineBotInfo(TAICHUNG_STORE_ID);
    if (!result.ok) {
      return { success: true, data: { status: "FAIL", code: result.code, displayName: null, basicId: null, matchesTaichungStore: false, checkedAt } };
    }

    const matchesTaichungStore = result.data.userId === store.lineDestination;
    return {
      success: true,
      data: {
        status: matchesTaichungStore ? "PASS" : "FAIL",
        code: matchesTaichungStore ? "BOT_IDENTITY_MATCH" : "BOT_IDENTITY_MISMATCH",
        displayName: result.data.displayName,
        basicId: result.data.basicId,
        matchesTaichungStore,
        checkedAt,
      },
    };
  } catch (error) {
    return handleActionError(error);
  }
}
