"use server";

import { requirePermission } from "@/lib/permissions";
import { runReconciliation } from "@/server/reconciliation/engine";

export async function triggerReconciliation() {
  await requirePermission("report.read");
  const result = await runReconciliation("manual");
  return result;
}
