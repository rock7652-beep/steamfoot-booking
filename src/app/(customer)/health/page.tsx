import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getNativeHealthSummary } from "@/lib/native-health-service";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";
import { redirect } from "next/navigation";
import Link from "next/link";
import { HealthAssessmentCard } from "@/components/health-assessment-card";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

/**
 * 顧客 Web 健康紀錄頁。量測、歷史與曲線皆由蒸管家原生提供。
 *
 * 權限：沿用 (customer)/layout.tsx 的 role/store/完成註冊 gate。
 * AI 健康評估入口與摘要共用 `ai_health_summary` 店舖功能開關。
 */
export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const storeCtx = await getStoreContext();
  const prefix = `/s/${storeCtx?.storeSlug ?? "zhubei"}`;
  const { saved } = await searchParams;

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

  const summary = await getNativeHealthSummary(customerId, storeCtx.storeId).catch(() => null);

  return (
    <div>
      <HealthPageHeader prefix={prefix} />

      {saved === "1" && (
        <div role="status" className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
          量測已儲存，以下是最新健康紀錄。
        </div>
      )}

      <Link
        href={`${prefix}/health/new`}
        className="mb-5 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-primary-600 text-base font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]"
      >
        新增量測
      </Link>

      {/* 簡易數據卡 — 不傳 customerId 以隱藏卡片內重複的「查看完整評估」連結 */}
      {summary?.latest ? (
        <HealthAssessmentCard summary={summary} />
      ) : (
        <div className="rounded-2xl border border-earth-200 bg-white p-5 text-center shadow-sm">
          <p className="text-base font-semibold text-earth-900">尚無量測紀錄</p>
          <p className="mt-2 text-sm leading-relaxed text-earth-700">
            點上方「新增量測」完成第一次紀錄，這裡就會顯示你的身體數據摘要。
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
        <h1 className="text-2xl font-bold text-earth-900">健康紀錄</h1>
        <p className="mt-1 text-sm text-earth-700">量測、歷史紀錄與身體數據趨勢</p>
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
