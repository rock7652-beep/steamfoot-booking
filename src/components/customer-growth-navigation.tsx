import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext } from "@/lib/store-view-context-server";
import { getStoreFeaturePresentation } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { CustomerGrowthTabLink } from "@/components/customer-growth-tab-link";

/** Customer workspaces share navigation; each retains its own authorization. */
export async function CustomerGrowthNavigation({ active }: { active: "care" | "leads" }) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) return null;
  const [storeId, view] = await Promise.all([getActiveStoreForRead(user), resolveStoreViewContextFromCookie(user)]);
  const viewedStoreId = storeIdForViewContext(storeId, view);
  if (!viewedStoreId) return null;
  const [care, leads, consumptionPermissions, industry] = await Promise.all([
    getStoreFeaturePresentation(viewedStoreId, FEATURES.CUSTOMER_CARE),
    getStoreFeaturePresentation(viewedStoreId, FEATURES.DIGITAL_BUTLER),
    Promise.all((["booking.read", "wallet.read", "transaction.read"] as const).map(permission => checkPermission(user.role, user.staffId, permission))),
    getStoreIndustryModule(viewedStoreId),
  ]);
  const tabs = [
    { id: "care", label: "顧客關懷", href: industry === "beauty" ? "/dashboard/beauty?tab=顧客經營" : "/dashboard/growth", state: care },
    ...(["course","steamfoot"].includes(industry) && consumptionPermissions.every(Boolean) ? [{ id: "consumption", label: "期間消耗統計", href: "/dashboard/growth/consumption", state: care }] : []),
    { id: "leads", label: "數位管家名單", href: "/dashboard/digital-butler/leads", state: leads },
  ];
  return <nav aria-label="顧客經營分類" className="mx-3 flex flex-wrap gap-1 border-b border-earth-200 sm:mx-6">
    {tabs.filter(tab => user.role === "ADMIN" || tab.state !== "HIDDEN").map(tab => tab.state === "ENABLED" ? <CustomerGrowthTabLink key={tab.id} id={tab.id} href={tab.href} label={tab.label} active={active} /> : <span key={tab.id} aria-disabled="true" className="flex min-h-11 items-center gap-2 px-3 text-sm text-earth-500">{tab.label}<span className="text-xs">{tab.state === "HIDDEN" ? "已隱藏" : "未開通"}</span></span>)}
  </nav>;
}
