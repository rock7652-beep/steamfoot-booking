import "server-only";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

/** All operations, including previews, reject viewed stores and stale store scopes. */
export async function customerMessageAccess(expectedStoreId:string) {
  const user = await requirePermission("customer.message.send");
  await requirePermission("customer.read");
  const storeId = await resolveWriteStoreId(user);
  if(storeId !== expectedStoreId) throw new Error("門市已切換，請重新開啟發送訊息");
  await requireStoreFeature(storeId, FEATURES.CUSTOMER_MANAGEMENT);
  await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
  return {user,storeId};
}
