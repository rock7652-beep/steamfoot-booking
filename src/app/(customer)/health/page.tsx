import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getHealthCardData } from "@/server/queries/health-card";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";
import { redirect } from "next/navigation";
import Link from "next/link";
import { HealthAssessmentCard } from "@/components/health-assessment-card";
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
 * 權限：沿用 (customer)/layout.tsx 的 role/store/完成註冊 gate，本頁不另做檢查
 * （與 /my-plans、/my-referrals 一致）。多店以 getStoreContext + resolver 隔離。
 */
export default async function HealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const storeCtx = await getStoreContext();
  const prefix = `/s/${storeCtx?.storeSlug ?? "zhubei"}`;

  // 與 /my-bookings、/my-plans 同一份 resolver，避免 session.customerId stale
  const resolved = await resolveCustomerForUser({
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId: user.storeId ?? storeCtx?.storeId ?? null,
    storeSlug: storeCtx?.storeSlug ?? null,
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
      {/* Header — 標題 + 輔助文字（最近量測日期不在這裡顯示，避免與卡片重複） */}
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

      {/* 前往量測（主按鈕，signed bridge entry；不直接傳 customerId 給 HealthFlow） */}
      <HealthflowEntryButton storeSlug={storeCtx?.storeSlug ?? "zhubei"} />

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
