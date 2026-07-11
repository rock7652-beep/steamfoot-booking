import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getHealthCardData } from "@/server/queries/health-card";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";
import { redirect } from "next/navigation";
import Link from "next/link";
import { HealthAssessmentCard } from "@/components/health-assessment-card";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { HealthflowEntryButton } from "./healthflow-entry-button";

/**
 * 顧客 Web 健康評估頁（PR-Frontend-2）
 *
 * 資訊架構歸位：AI 健康簡易數據從 /my-bookings 搬到這裡。
 *   - 上方：標題 + 輔助文字 + 「前往量測」主按鈕（signed SteamFoot → HealthFlow bridge）
 *   - 下方：AI 健康評估簡易數據卡（最近量測日期只在卡片內出現一次）
 *
 * 「前往量測」由頁面上方單一主按鈕負責跳轉，並透過 server action
 * 產生 signed bridge state；卡片不傳 customerId 以隱藏其內建外部連結。
 *
 * 權限：沿用 (customer)/layout.tsx 的 role/store/完成註冊 gate。
 * AI 健康評估入口與摘要共用 `ai_health_summary` 店舖功能開關。
 */
export default async function HealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const storeCtx = await getStoreContext();
  const prefix = `/s/${storeCtx?.storeSlug ?? "zhubei"}`;

  if (
    !storeCtx?.storeId ||
    !(await hasStoreFeature(storeCtx.storeId, FEATURES.AI_HEALTH_SUMMARY))
  ) {
    return <HealthFeatureLockedState prefix={prefix} />;
  }

  // 與 /my-bookings、/my-plans 同一份 resolver，避免 session.customerId stale
  const resolved = await resolveCustomerForUser({
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId: user.storeId ?? storeCtx.storeId,
    storeSlug: storeCtx.storeSlug,
  });
  const customerId = resolved.customer?.id ?? null;
  if (!customerId) redirect("/");

  // getHealthCardData 內部已 try/catch；這層多包一道防止意外，整頁不掛
  const healthCard = await getHealthCardData(customerId).catch(
    () =>
      ({ available: false, reason: "error" }) as Awaited<
        ReturnType<typeof getHealthCardData>
      >,
  );

  return (
    <div>
      <HealthPageHeader prefix={prefix} />

      {/* 前往量測（主按鈕，signed bridge entry；不直接傳 customerId 給 HealthFlow） */}
      <HealthflowEntryButton storeSlug={storeCtx.storeSlug} />

      {/* 簡易數據卡 — 不傳 customerId 以隱藏卡片內重複的「查看完整評估」連結 */}
      {healthCard.available ? (
        <HealthAssessmentCard summary={healthCard.summary} />
      ) : (
        <div className="rounded-2xl border border-earth-200 bg-white p-5 text-center shadow-sm">
          <p className="text-base font-semibold text-earth-900">尚無量測紀錄</p>
          <p className="mt-2 text-sm leading-relaxed text-earth-700">
            點上方「前往量測」完成第一次 AI 健康評估，這裡就會顯示你的身體數據摘要。
          </p>
        </div>
      )}
    </div>
  );
}

function HealthPageHeader({ prefix }: { prefix: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <Link
        href={`${prefix}/book`}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700 hover:text-earth-900 lg:hidden"
      >
        &larr;
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-earth-900">健康評估</h1>
        <p className="mt-1 text-sm text-earth-700">掌握最近一次身體狀態與 AI 建議</p>
      </div>
    </div>
  );
}

function HealthFeatureLockedState({ prefix }: { prefix: string }) {
  return (
    <div>
      <HealthPageHeader prefix={prefix} />
      <div className="rounded-2xl border border-earth-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-earth-100 text-earth-500">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 018 0v3" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-earth-900">健康評估尚未開通</h2>
        <p className="mt-2 text-sm leading-relaxed text-earth-600">
          此店目前未開通 AI 健康評估與摘要功能，請洽店家協助。
        </p>
        <Link
          href={`${prefix}/book`}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-earth-200 px-5 text-sm font-semibold text-earth-700 hover:bg-earth-50"
        >
          返回首頁
        </Link>
      </div>
    </div>
  );
}
