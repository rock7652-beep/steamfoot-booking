import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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

  // 讀取 store-slug 用於 logout redirect（ADMIN 不帶 slug，回 /）
  const ckStore = await cookies();
  const dashStoreSlug = user.role !== "ADMIN" ? (ckStore.get("store-slug")?.value ?? null) : null;

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
          {dashStoreSlug && dashStoreSlug !== "__hq__" && (
            <input type="hidden" name="storeSlug" value={dashStoreSlug} />
          )}
          <button
            type="submit"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-earth-600 hover:bg-earth-50"
          >
            <svg className="h-3.5 w-3.5 text-earth-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
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
