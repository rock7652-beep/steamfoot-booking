"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/session";
import { validateStoreAccess } from "@/lib/store";
import { AppError, handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

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
