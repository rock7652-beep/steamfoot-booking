"use server";

import { cookies } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { requireStaffSession } from "@/lib/session";
import { resolveAuthorizedConcreteStore } from "@/lib/store";
import { OWN_STORE_VALUE, VIEWED_STORE_COOKIE_NAME } from "@/lib/store-view-mode-constants";
import { AppError, handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

/**
 * Switch a non-HQ staff user into a descendant read-only view context.
 *
 * Redirect in the same action as the cookie update. Returning a normal action
 * response would render the old route using the new cookie before client-side
 * navigation, mixing two store contexts in one render.
 */
export async function switchViewedStore(
  viewedStoreId: string,
  currentPathname = "/dashboard",
): Promise<ActionResult<never>> {
  let destination: string;
  try {
    const user = await requireStaffSession();
    if (user.role !== "OWNER") {
      throw new AppError("FORBIDDEN", "只有母店店長可切換展店");
    }
    if (!user.storeId) {
      throw new AppError("UNAUTHORIZED", "缺少店舖資訊，請重新登入");
    }

    const cookieStore = await cookies();
    const requestedStoreId = !viewedStoreId || viewedStoreId === OWN_STORE_VALUE
      ? user.storeId
      : viewedStoreId;
    const authorizedStore = await resolveAuthorizedConcreteStore(
      user,
      requestedStoreId,
      "switch",
    );

    // The caller may preserve a dashboard path, never a destination host/store.
    // Drop query filters and reject dot segments, encoded paths and backslashes.
    const dashboardPath = currentPathname.match(
      /^(?:\/s\/[^/]+\/admin|\/hq)?(\/dashboard(?:\/[a-zA-Z0-9_-]+)*\/?)$/,
    )?.[1] ?? "/dashboard";
    destination = `/s/${encodeURIComponent(authorizedStore.slug)}/admin${dashboardPath}`;

    if (authorizedStore.id === user.storeId) {
      cookieStore.delete(VIEWED_STORE_COOKIE_NAME);
    } else {
      cookieStore.set(VIEWED_STORE_COOKIE_NAME, authorizedStore.id, {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
      });
    }

  } catch (e) {
    return handleActionError(e);
  }
  // Keep NEXT_REDIRECT outside the catch and do not refresh the old route.
  redirect(destination, RedirectType.replace);
}

export async function getViewedStoreCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(VIEWED_STORE_COOKIE_NAME)?.value ?? null;
}
