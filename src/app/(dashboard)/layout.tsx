import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import { getUserPermissions, ROLE_LABELS } from "@/lib/permissions";
import { getCachedStorePlan, getCachedTrialStatus } from "@/lib/query-cache";
import { getStoreOptions, resolveActiveStoreId } from "@/lib/store";
import { getActiveStoreCookie } from "@/server/actions/store-switch";
import DashboardShell from "@/components/sidebar";
import { LogoutButton } from "@/components/logout-button";
import { SubscriptionStatusBanner } from "@/components/subscription-status-banner";
import { StoreOperatingStatusBanner } from "@/components/store-operating-status-banner";
import { prisma } from "@/lib/db";
import { computeLifecycle } from "@/lib/subscription-lifecycle";
import { toLocalDateStr } from "@/lib/date-utils";
import type { StoreOperatingStatus } from "@/lib/store-operating-status";

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
  // 走 unstable_cache（60s TTL, tag: "store-plan"）— 之前直接呼叫
  // getStorePlanById 是同步阻塞，每次切頁都打一次 prisma，現在多人切頁
  // 共享 cache。Mutation 路徑已透過 revalidation.ts 失效對應 tag。
  const effectiveStoreId = isAdmin ? (activeStoreId ?? undefined) : (user.storeId ?? undefined);
  const pricingPlan = isAdmin && !activeStoreId
    ? ("ALLIANCE" as const)
    : effectiveStoreId
      ? await getCachedStorePlan(effectiveStoreId)
      : ("EXPERIENCE" as const);

  // 讀取 store-slug 用於 logout redirect（ADMIN 不帶 slug，回 /）
  const ckStore = await cookies();
  const dashStoreSlug = !isAdmin ? (ckStore.get("store-slug")?.value ?? null) : null;

  // §5 訂閱到期 / 暫停登入提醒（衍生狀態）。
  // 只 select status + expiresAt（既有欄位）→ prod-safe（不碰 #295 新欄位）；
  // 查詢失敗不影響後台（提醒非關鍵功能）。本階段只提醒、不限制操作。
  let subBannerState: "EXPIRED" | "SUSPENDED" | null = null;
  let operatingStatus: StoreOperatingStatus | null = null;
  if (effectiveStoreId) {
    try {
      const [sub, store] = await Promise.all([
        prisma.storeSubscription.findFirst({
          where: { storeId: effectiveStoreId },
          orderBy: { createdAt: "desc" },
          select: { status: true, expiresAt: true },
        }),
        prisma.store.findUnique({
          where: { id: effectiveStoreId },
          select: { operatingStatus: true },
        }),
      ]);
      operatingStatus = store?.operatingStatus ?? null;
      if (sub) {
        const lc = computeLifecycle(
          { status: sub.status, expiresAt: sub.expiresAt },
          toLocalDateStr(),
        );
        if (lc.state === "EXPIRED" || lc.state === "SUSPENDED") {
          subBannerState = lc.state;
        }
      }
    } catch {
      // 忽略：提醒非關鍵功能
    }
  }

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
      {operatingStatus ? (
        <StoreOperatingStatusBanner status={operatingStatus} />
      ) : null}
      {subBannerState ? (
        <SubscriptionStatusBanner state={subBannerState} />
      ) : null}
      {children}
    </DashboardShell>
  );
}
