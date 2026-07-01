import { cookies } from "next/headers";
import {
  resolveStoreViewContext,
  type StoreViewContext,
} from "@/lib/store-organization";
import { VIEWED_STORE_COOKIE_NAME } from "@/lib/store-view-mode-constants";

type StoreScopedUser = {
  id?: string | null;
  role: string;
  storeId?: string | null;
};

export async function resolveStoreViewContextFromCookie(
  user: StoreScopedUser,
): Promise<StoreViewContext | null> {
  if (user.role === "ADMIN" || user.role === "CUSTOMER" || !user.storeId) {
    return null;
  }

  const cookieStore = await cookies();
  const viewedStoreId = cookieStore.get(VIEWED_STORE_COOKIE_NAME)?.value ?? null;
  try {
    return await resolveStoreViewContext(user, { viewedStoreId });
  } catch (err) {
    console.warn("[store-view-context] invalid viewed-store-id cookie, falling back to own store", {
      userId: user.id,
      ownStoreId: user.storeId,
      viewedStoreId,
      error: err instanceof Error ? err.message : String(err),
    });
    return resolveStoreViewContext(user);
  }
}

export function storeIdForViewContext(
  fallbackStoreId: string | null,
  viewContext: StoreViewContext | null,
): string | null {
  return viewContext?.isViewMode
    ? viewContext.viewedStoreId ?? fallbackStoreId
    : fallbackStoreId;
}

export function userForViewContext<T extends StoreScopedUser>(
  user: T,
  viewContext: StoreViewContext | null,
): T {
  if (!viewContext?.isViewMode || !viewContext.viewedStoreId) return user;
  return { ...user, storeId: viewContext.viewedStoreId };
}
