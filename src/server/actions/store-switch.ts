"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/session";
import { validateStoreAccess } from "@/lib/store";
import { AppError, handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";
import { prisma } from "@/lib/db";
import { persistFollowupAudit } from "@/server/services/operation-audit-outbox";

const COOKIE_NAME = "active-store-id";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * 切換 ADMIN 的查看視角（寫入 cookie）。
 * storeId 為 "__all__" 時代表查看全部分店。
 */
export async function switchActiveStore(
  storeId: string,
): Promise<ActionResult<void>> {
  try {
    const user = await requireStaffSession();
    if (user.role !== "ADMIN") {
      throw new AppError("UNAUTHORIZED", "僅總部管理者可使用平台店舖切換");
    }

    await validateStoreAccess(user, storeId, "switch");

    const cookieStore = await cookies();
    const previousStoreId = cookieStore.get(COOKIE_NAME)?.value ?? "__all__";
    if (previousStoreId !== storeId) {
      // Returning to HQ belongs to the previously viewed store. Never use the
      // "__all__" sentinel as an evidence store ID.
      const evidenceStoreId = storeId === "__all__" ? previousStoreId : storeId;
      const evidenceStore = await prisma.store.findUnique({
        where: { id: evidenceStoreId }, select: { id: true, name: true },
      });
      if (evidenceStore) {
        // Persist intent before changing the non-transactional cookie. A failed
        // enqueue leaves the existing view intact; delivery preserves this login.
        await persistFollowupAudit({
          actorUserId: user.id,
          actorNameSnapshot: user.name,
          storeId: evidenceStore.id,
          module: "SHARED",
          targetType: "StoreView",
          targetId: evidenceStore.id,
          action: storeId === "__all__" ? "HQ_VIEW_ALL_STORES" : "HQ_VIEW_STORE",
          summary: storeId === "__all__"
            ? "返回總部全部店舖檢視請求"
            : `切換總部店家檢視請求「${evidenceStore.name}」`,
          before: { viewedStoreId: previousStoreId },
          after: { viewedStoreId: storeId },
        });
      } else if (storeId !== "__all__") {
        throw new AppError("NOT_FOUND", "店舖不存在，已保留原檢視");
      }
    }
    cookieStore.set(COOKIE_NAME, storeId, {
      path: "/",
      maxAge: MAX_AGE,
      sameSite: "lax",
      httpOnly: false, // client needs to read for optimistic UI
    });

    // Revalidate all dashboard pages so server components re-fetch with new store
    revalidatePath("/dashboard", "layout");
    revalidatePath("/hq/dashboard", "layout");

    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

/**
 * Server-side 讀取 active-store-id cookie。
 * 供 layout.tsx 等 Server Component 使用。
 */
export async function getActiveStoreCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}
