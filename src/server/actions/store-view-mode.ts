"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/session";
import { isOwner } from "@/lib/permissions";
import { assertCanViewStore } from "@/lib/store-organization";
import { OWN_STORE_VALUE, VIEWED_STORE_COOKIE_NAME } from "@/lib/store-view-mode-constants";
import { AppError, handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

/**
 * Switch a non-HQ staff user into a descendant read-only view context.
 *
 * This is foundation only: it stores selected view context and revalidates the
 * dashboard shell. Individual modules are intentionally not wired to read from
 * viewedStoreId in PR-3.
 */
export async function switchViewedStore(
  viewedStoreId: string,
): Promise<ActionResult<void>> {
  try {
    const user = await requireStaffSession();
    if (isOwner(user.role)) {
      throw new AppError("FORBIDDEN", "HQ 不使用店長查看模式");
    }
    if (!user.storeId) {
      throw new AppError("UNAUTHORIZED", "缺少店舖資訊，請重新登入");
    }

    const cookieStore = await cookies();
    if (!viewedStoreId || viewedStoreId === OWN_STORE_VALUE || viewedStoreId === user.storeId) {
      cookieStore.delete(VIEWED_STORE_COOKIE_NAME);
    } else {
      await assertCanViewStore(user, viewedStoreId);
      cookieStore.set(VIEWED_STORE_COOKIE_NAME, viewedStoreId, {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
      });
    }

    revalidatePath("/dashboard", "layout");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function getViewedStoreCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(VIEWED_STORE_COOKIE_NAME)?.value ?? null;
}
