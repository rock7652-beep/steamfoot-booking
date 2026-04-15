import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import { getUserPermissions, ROLE_LABELS, isStaffRole } from "@/lib/permissions";
import { getCachedShopPlan, getCachedTrialStatus } from "@/lib/query-cache";
import { getStoreOptions, resolveActiveStoreId } from "@/lib/store";
import { getActiveStoreCookie } from "@/server/actions/store-switch";
import { getStorePlanById } from "@/lib/store-plan";
import DashboardShell from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/hq/login");
  }
  if (user.role === "CUSTOMER") {
    // B7-4: 顧客不可進後台，導回所屬店
    const { cookies: getCookies } = await import("next/headers");
    const ck = await getCookies();
    const slug = ck.get("store-slug")?.value ?? "zhubei";
    redirect(`/s/${slug}/book`);
  }

  const roleLabel = ROLE_LABELS[user.role] ?? "";
  const isOwnerRole = user.role === "ADMIN";

  const [permissions, shopPlan, trialStatus, storeOptions, cookieStoreId, pricingPlan] =
    await Promise.all([
      getUserPermissions(user.role, user.staffId),
      getCachedShopPlan(),
      getCachedTrialStatus(),
      isOwnerRole ? getStoreOptions() : Promise.resolve([]),
      isOwnerRole ? getActiveStoreCookie() : Promise.resolve(null),
      user.storeId ? getStorePlanById(user.storeId) : Promise.resolve("EXPERIENCE" as const),
    ]);

  // Resolve the effective active store for read views
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  return (
    <DashboardShell
      isOwner={isOwnerRole}
      permissions={permissions}
      shopPlan={shopPlan}
      pricingPlan={pricingPlan}
      userName={user.name ?? ""}
      roleLabel={roleLabel}
      logoutButton={
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-xs text-earth-400 hover:text-earth-700 sm:text-sm"
          >
            登出
          </button>
        </form>
      }
      trialStatus={trialStatus}
      storeOptions={isOwnerRole ? storeOptions : undefined}
      activeStoreId={isOwnerRole ? activeStoreId : undefined}
    >
      {children}
    </DashboardShell>
  );
}
