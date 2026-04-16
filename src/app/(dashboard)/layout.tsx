import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import { getUserPermissions, ROLE_LABELS, isStaffRole } from "@/lib/permissions";
import { getCachedTrialStatus } from "@/lib/query-cache";
import { getStoreOptions, resolveActiveStoreId } from "@/lib/store";
import { getActiveStoreCookie } from "@/server/actions/store-switch";
import { getStorePlanById } from "@/lib/store-plan";
import DashboardShell from "@/components/sidebar";
import { LogoutButton } from "@/components/logout-button";

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
  const isAdmin = user.role === "ADMIN";
  // isOwnerLevel: ADMIN + 店長 + 合作店長 — 用於 sidebar ownerOnly 功能項顯示
  const isOwnerLevel = isAdmin || user.role === "OWNER" || user.role === "PARTNER";

  // Source of truth: Store.plan (PricingPlan)
  const [permissions, trialStatus, storeOptions, cookieStoreId] =
    await Promise.all([
      getUserPermissions(user.role, user.staffId),
      getCachedTrialStatus(user.storeId ?? undefined),
      isAdmin ? getStoreOptions() : Promise.resolve([]),
      isAdmin ? getActiveStoreCookie() : Promise.resolve(null),
    ]);

  // Resolve the effective active store for read views（ADMIN 可切店）
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  // ADMIN 看到的 plan：切到特定店時用該店 plan，全部分店時解鎖全部功能（ALLIANCE）
  // OWNER/PARTNER：用自己店的 plan
  const effectiveStoreId = isAdmin ? (activeStoreId ?? undefined) : (user.storeId ?? undefined);
  const pricingPlan = isAdmin && !activeStoreId
    ? ("ALLIANCE" as const)
    : effectiveStoreId
      ? await getStorePlanById(effectiveStoreId)
      : ("EXPERIENCE" as const);

  // 讀取 store-slug 用於 logout redirect（ADMIN 不帶 slug，回 /）
  const ckStore = await cookies();
  const dashStoreSlug = !isAdmin ? (ckStore.get("store-slug")?.value ?? null) : null;

  return (
    <DashboardShell
      isOwner={isOwnerLevel}
      permissions={permissions}
      pricingPlan={pricingPlan}
      userName={user.name ?? ""}
      roleLabel={roleLabel}
      logoutButton={
        <form action={logoutAction}>
          {dashStoreSlug && dashStoreSlug !== "__hq__" && (
            <input type="hidden" name="storeSlug" value={dashStoreSlug} />
          )}
          <LogoutButton
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-earth-600 hover:bg-earth-50"
            iconClassName="text-earth-400"
            iconSize={14}
          />
        </form>
      }
      trialStatus={trialStatus}
      storeOptions={isAdmin ? storeOptions : undefined}
      activeStoreId={isAdmin ? activeStoreId : undefined}
    >
      {children}
    </DashboardShell>
  );
}
