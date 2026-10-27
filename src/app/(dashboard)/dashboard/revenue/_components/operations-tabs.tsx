import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { type OperationsArea, type OperationsQuery } from "@/lib/operations-navigation";
import { RevenueTabs } from "./revenue-tabs";
/** Each tab authorizes independently; report/export-only staff need no ledger access. */
export async function OperationsTabs({ active = "ledger", query = {}, beautyLedger = false }: {
  active?: OperationsArea; query?: OperationsQuery; beautyLedger?: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const [ledger, report, cashbook, customerExport, reportExport] = await Promise.all(
    (["transaction.read", "report.read", "cashbook.read", "customer.export", "report.export"] as const)
      .map(permission => checkPermission(user.role, user.staffId, permission)),
  );
  const available: OperationsArea[] = [];
  if (ledger) available.push("ledger");
  if (report) available.push("income");
  if (cashbook) available.push("cashbook");
  if (report) available.push("monthly");
  if (report || customerExport || reportExport) available.push("exports");
  return <RevenueTabs active={active} query={query} beautyLedger={beautyLedger} available={available}/>;
}
