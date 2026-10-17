import "server-only";
import { getEffectiveActorRole, getHqStoreViewContext } from "@/lib/hq-store-view-context";
import { musicDataSeparationEnabled } from "@/server/services/music-data-scope";
export function isPreviewHqStoreManager(user: {role:string}, storeId:string) {
  return user.role === "ADMIN" && getHqStoreViewContext(user)?.storeId === storeId && musicDataSeparationEnabled(storeId);
}
/** Called after permission/store authorization; only preview HQ gets this exception. */
export function canManageCashbookEntry(user: {role:string;staffId?:string|null}, entry:{storeId:string;staffId:string|null}) {
  return getEffectiveActorRole(user) === "ADMIN" ||
    isPreviewHqStoreManager(user, entry.storeId) ||
    (!!user.staffId && entry.staffId === user.staffId);
}
