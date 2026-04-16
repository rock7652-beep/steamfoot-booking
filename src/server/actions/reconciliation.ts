"use server";

import { requirePermission } from "@/lib/permissions";
import { checkCurrentStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { currentStoreId } from "@/lib/store";
import { runReconciliation } from "@/server/reconciliation/engine";

export async function triggerReconciliation() {
  const user = await requirePermission("report.read");
  await checkCurrentStoreFeature(FEATURES.RECONCILIATION);
  const storeId = currentStoreId(user);
  const result = await runReconciliation(storeId, "manual");
  return result;
}
