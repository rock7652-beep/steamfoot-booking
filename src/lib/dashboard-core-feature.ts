import { requireStaffSession } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import type { FeatureKey } from "@/lib/feature-flags";

/** Each page gates itself: cached layouts are not an authorization boundary. */
export async function requireDashboardCoreFeature(feature: FeatureKey): Promise<void> {
  const user = await requireStaffSession();
  const storeId = await getActiveStoreForRead(user);
  if (storeId) await requireStoreFeature(storeId, feature);
}
