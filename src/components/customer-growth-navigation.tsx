import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext } from "@/lib/store-view-context-server";
import { getStoreFeaturePresentation } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { DashboardLink } from "@/components/dashboard-link";

/** Two existing workspaces share one navigation; their data/authorization stay independent. */
export async function CustomerGrowthNavigation({ active }: { active: "care" | "leads" }) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) return null;
  const [storeId, view] = await Promise.all([getActiveStoreForRead(user), resolveStoreViewContextFromCookie(user)]);
  const viewedStoreId = storeIdForViewContext(storeId, view);
  if (!viewedStoreId) return null;
  const [care, leads] = await Promise.all([
    getStoreFeaturePresentation(viewedStoreId, FEATURES.CUSTOMER_CARE),
    getStoreFeaturePresentation(viewedStoreId, FEATURES.DIGITAL_BUTLER),
  ]);
  const tabs = [
    { id: "care", label: "顧客關懷", href: "/dashboard/growth", state: care },
    { id: "leads", label: "數位管家名單", href: "/dashboard/digital-butler/leads", state: leads },
  ];
  return <nav aria-label="顧客經營分類" className="mx-3 flex flex-wrap gap-1 border-b border-earth-200 sm:mx-6">
    {tabs.filter(tab => user.role === "ADMIN" || tab.state !== "HIDDEN").map(tab => tab.state === "ENABLED" ? <DashboardLink key={tab.id} href={tab.href} aria-current={active === tab.id ? "page" : undefined} className={`flex min-h-11 items-center border-b-2 px-3 text-sm ${active === tab.id ? "border-primary-600 font-semibold text-primary-900" : "border-transparent text-earth-600 hover:text-primary-800"}`}>{tab.label}</DashboardLink> : <span key={tab.id} aria-disabled="true" className="flex min-h-11 items-center gap-2 px-3 text-sm text-earth-500">{tab.label}<span className="text-xs">{tab.state === "HIDDEN" ? "已隱藏" : "未開通"}</span></span>)}
  </nav>;
}
