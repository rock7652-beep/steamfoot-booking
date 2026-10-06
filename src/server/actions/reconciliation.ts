"use server";

import { requireInventoryFinanceAccess } from "@/server/inventory-finance-access";
import { requirePermission } from "@/lib/permissions";
import { checkCurrentStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { currentStoreId } from "@/lib/store";
import { runReconciliation } from "@/server/reconciliation/engine";

export async function triggerReconciliation() {
  const user = await requirePermission("report.read");
  await checkCurrentStoreFeature(FEATURES.RECONCILIATION);
  const storeId = currentStoreId(user);
  await requireInventoryFinanceAccess(storeId, user);
  const result = await runReconciliation(storeId, "manual");
  return result;
}
