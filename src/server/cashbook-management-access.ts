import "server-only";
import { getEffectiveActorRole, getHqStoreViewContext } from "@/lib/hq-store-view-context";
import { musicDataSeparationEnabled } from "@/server/services/music-data-scope";
/** Called after permission/store authorization; only preview HQ gets this exception. */
export function canManageCashbookEntry(user: {role:string;staffId?:string|null}, entry:{storeId:string;staffId:string|null}) {
  return getEffectiveActorRole(user) === "ADMIN" ||
    (user.role === "ADMIN" && getHqStoreViewContext(user)?.storeId === entry.storeId && musicDataSeparationEnabled(entry.storeId)) ||
    (!!user.staffId && entry.staffId === user.staffId);
}
