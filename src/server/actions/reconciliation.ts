"use server";

import { requirePermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/shop-config";
import { FEATURES } from "@/lib/shop-plan";
import { runReconciliation } from "@/server/reconciliation/engine";

export async function triggerReconciliation() {
  await requirePermission("report.read");
  await requireFeature(FEATURES.RECONCILIATION);
  const result = await runReconciliation("manual");
  return result;
}
