"use server";

import { requirePermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/shop-config";
import { FEATURES } from "@/lib/shop-plan";
import { currentStoreId } from "@/lib/store";
import { runReconciliation } from "@/server/reconciliation/engine";

export async function triggerReconciliation() {
  const user = await requirePermission("report.read");
  await requireFeature(FEATURES.RECONCILIATION);
  const storeId = currentStoreId(user);
  const result = await runReconciliation(storeId, "manual");
  return result;
}
