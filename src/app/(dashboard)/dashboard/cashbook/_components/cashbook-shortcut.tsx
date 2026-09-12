import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getActiveStoreForRead } from "@/lib/store";
import { QuickCashbook } from "./quick-cashbook";

export async function CashbookShortcut({ readOnly = false, triggerClassName }: { readOnly?: boolean; triggerClassName?: string }) {
  if (readOnly) return null;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "cashbook.read"))) return null;
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || !(await hasStoreFeature(storeId, FEATURES.CASHBOOK))) return null;
  return <QuickCashbook key={storeId} storeId={storeId} triggerClassName={triggerClassName} />;
}
