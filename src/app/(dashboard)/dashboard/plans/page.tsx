import { listPlans } from "@/server/queries/plan";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getCachedStorePlan } from "@/lib/query-cache";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { PlansManager } from "./_components/plans-manager";
import type { PlanRow } from "./_components/plan-form-drawer";

export default async function PlansPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "wallet.read"))) {
    redirect("/dashboard");
  }
  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const plansStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  // 可以管理方案（新增 / 編輯 / 切換上架與顧客可購買）= wallet.create permission
  // ADMIN 永遠放行；OWNER + PARTNER 預設都有 wallet.create，所以店長也看得到入口
  const canManage =
    !isViewMode &&
    (await checkPermission(user.role, user.staffId, "wallet.create"));

  // 桌機版 manager 自己處理 status / category / visibility 篩選，所以
  // 一律抓 includeInactive，client 再 filter — 不再依賴 ?showAll 參數。
  const logCtx = { page: "plans" as const, userId: user.id, sessionRole: user.role };
  const [plans, storePlan] = await Promise.all([
    listPlans(true, plansStoreId).catch((e) => {
      console.error("[plans] listPlans failed", {
        ...logCtx,
        step: "listPlans",
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Awaited<ReturnType<typeof listPlans>>;
    }),
    // 缺 store 時退回 EXPERIENCE，等於只解鎖最低方案功能 — 比整頁掛掉好；
    // FeatureGate 會根據此值決定是否顯示升級提示。
    getCachedStorePlan(plansStoreId ?? undefined).catch((e) => {
      console.error("[plans] getCurrentStorePlan failed", {
        ...logCtx,
        step: "getCurrentStorePlan",
        error: e instanceof Error ? e.message : String(e),
      });
      return "EXPERIENCE" as const;
    }),
  ]);

  // Prisma Decimal can't cross the RSC → client component boundary;
  // serialise to Number once here so the client never sees Decimal.
  const planRows: PlanRow[] = plans.map((p) => ({
    ...p,
    price: Number(p.price) as unknown as PlanRow["price"],
  }));

  return (
    <FeatureGate plan={storePlan} feature={FEATURES.PLAN_MANAGEMENT}>
      <PageShell>
        <PageHeader
          title="方案管理"
          subtitle="管理前台可購買與店內可指派方案"
          actions={
            <Link
              href="/dashboard"
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              ← 返回首頁
            </Link>
          }
        />

        <PlansManager
          initialPlans={planRows}
          canManage={canManage}
          readOnly={isViewMode}
        />
      </PageShell>
    </FeatureGate>
  );
}
