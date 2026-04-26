import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { listBookings } from "@/server/queries/booking";
import { getHealthCardData } from "@/server/queries/health-card";
import { getCustomerPlanSummaryForSession } from "@/lib/customer-plan-contract";
import { getFrontendPlans } from "@/server/queries/plan";
import { getShopConfig } from "@/lib/shop-config";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { PlanCategory } from "@prisma/client";
import { HealthAssessmentCard } from "@/components/health-assessment-card";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  BOOKING_TYPE_LABEL,
  isBookingPast,
  PENDING_STATUSES,
} from "@/lib/booking-constants";

const PLAN_CATEGORY_LABEL: Record<PlanCategory, string> = {
  TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE: "課程",
};

const PLAN_CATEGORY_COLOR: Record<PlanCategory, string> = {
  TRIAL: "bg-purple-100 text-purple-700",
  SINGLE: "bg-blue-100 text-blue-700",
  PACKAGE: "bg-green-100 text-green-700",
};

type Tab = "upcoming" | "history" | "plans";

interface PageProps {
  searchParams: Promise<{ tab?: Tab }>;
}

export default async function MyBookingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const tab: Tab = params.tab ?? "upcoming";
  const storeCtx = await getStoreContext();
  const prefix = `/s/${storeCtx?.storeSlug ?? "zhubei"}`;

  // 走 customer-plan-contract（自帶 canonical resolver）— 唯一真相來源
  const planSummary = await getCustomerPlanSummaryForSession({
    id: user.id,
    customerId: user.customerId ?? null,
    email: user.email ?? null,
    storeId: user.storeId ?? storeCtx?.storeId ?? null,
  });
  if (!planSummary) redirect("/");
  const customerId = planSummary.customerId;

  // 並行取預約 + 健康卡片
  const [{ bookings }, healthCard] = await Promise.all([
    listBookings({ pageSize: 50 }),
    getHealthCardData(customerId),
  ]);

  // 唯一定義：頂部「目前可預約」= availableSessions（與 my-plans 同源）
  const availableForBooking = planSummary.availableSessions;
  const hasSessions = availableForBooking > 0 || planSummary.totalRemainingSessions > 0;

  // 購買方案 tab — 只在切到此 tab 才查詢方案 / 店家匯款資訊
  const isPlansTab = tab === "plans";
  const storeId = storeCtx?.storeId ?? null;
  const [shopPlans, shopConfig] = isPlansTab && storeId
    ? await Promise.all([getFrontendPlans(storeId), getShopConfig(storeId)])
    : [[], null];

  // 卡片導向：有堂數 → 我的方案詳情；無堂數 → 購買方案 tab
  const cardHref = hasSessions ? `${prefix}/my-plans` : `${prefix}/my-bookings?tab=plans`;
  const cardCtaLabel = hasSessions ? "查看我的方案" : "購買方案";

  // ── 依日期+時間拆分，而非僅依狀態 ──
  // upcoming = 未來 + 今日未過時段 的 PENDING/CONFIRMED
  // history  = 已過時段 + COMPLETED + NO_SHOW + CANCELLED
  const upcoming = bookings.filter((b) => {
    const isPending = (PENDING_STATUSES as readonly string[]).includes(b.bookingStatus);
    if (!isPending) return false;
    // 若日期+時段已過，算歷史
    return !isBookingPast(new Date(b.bookingDate), b.slotTime);
  });

  const history = bookings.filter((b) => {
    // 非 PENDING/CONFIRMED → 歷史
    const isPending = (PENDING_STATUSES as readonly string[]).includes(b.bookingStatus);
    if (!isPending) return true;
    // PENDING 但已過時段 → 歷史
    return isBookingPast(new Date(b.bookingDate), b.slotTime);
  });

  const displayed = tab === "upcoming" ? upcoming : history;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`${prefix}/book`} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700 hover:text-earth-900 lg:hidden">&larr;</Link>
          <h1 className="text-2xl font-bold text-earth-900">預約與方案</h1>
        </div>
        {hasSessions ? (
          <Link
            href={`${prefix}/book/new`}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-primary-700 transition"
          >
            <span className="text-lg">＋</span>
            新增預約
          </Link>
        ) : (
          <Link
            href={`${prefix}/my-bookings?tab=plans`}
            className="flex min-h-[44px] items-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-primary-700 transition"
          >
            購買方案
          </Link>
        )}
      </div>

      {/* 方案摘要 — 整張卡可點 */}
      <Link
        href={cardHref}
        className="mb-5 block rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition hover:bg-earth-50/40"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            {hasSessions ? (
              <>
                <p className="text-sm font-medium text-earth-700">目前可預約</p>
                <p className="mt-1">
                  <span className="text-3xl font-bold text-primary-700">{availableForBooking}</span>
                  <span className="ml-1 text-base font-medium text-earth-700">堂</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-earth-700">目前方案</p>
                <p className="mt-1 text-base text-earth-700">尚未購買方案</p>
              </>
            )}
          </div>
          <span className="flex items-center gap-1 text-base font-semibold text-primary-700">
            {cardCtaLabel}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </Link>

      {/* Health Assessment Card */}
      {healthCard.available && (
        <div className="mb-5">
          <HealthAssessmentCard score={healthCard.score} customerId={customerId} />
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-earth-200">
        <Link
          href="?tab=upcoming"
          className={`px-5 py-3 text-base font-semibold ${
            tab === "upcoming"
              ? "border-b-2 border-primary-600 text-primary-700"
              : "text-earth-700 hover:text-earth-900"
          }`}
        >
          即將到來
          {upcoming.length > 0 && (
            <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-sm font-semibold text-primary-800">
              {upcoming.length}
            </span>
          )}
        </Link>
        <Link
          href="?tab=history"
          className={`px-5 py-3 text-base font-semibold ${
            tab === "history"
              ? "border-b-2 border-primary-600 text-primary-700"
              : "text-earth-700 hover:text-earth-900"
          }`}
        >
          歷史紀錄
        </Link>
        <Link
          href="?tab=plans"
          className={`px-5 py-3 text-base font-semibold ${
            tab === "plans"
              ? "border-b-2 border-primary-600 text-primary-700"
              : "text-earth-700 hover:text-earth-900"
          }`}
        >
          購買方案
        </Link>
      </div>

      {/* 購買方案 Tab */}
      {isPlansTab ? (
        <div>
          <p className="mb-4 text-base text-earth-700">
            選擇適合你的方案，完成付款後店長會為你開通堂數。
          </p>

          {shopPlans.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <p className="text-base text-earth-700">目前沒有可購買的方案</p>
              <p className="mt-1 text-sm text-earth-500">請聯絡店長了解優惠方案</p>
            </div>
          ) : (
            <div className="space-y-3">
              {shopPlans.map((plan) => {
                const price = Number(plan.price);
                const avgPerSession = plan.sessionCount > 0 ? Math.round(price / plan.sessionCount) : 0;
                return (
                  <Link
                    key={plan.id}
                    href={`${prefix}/book/shop/${plan.id}/checkout`}
                    className="block rounded-2xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${PLAN_CATEGORY_COLOR[plan.category]}`}>
                            {PLAN_CATEGORY_LABEL[plan.category]}
                          </span>
                          <h3 className="text-base font-semibold text-earth-900">{plan.name}</h3>
                        </div>
                        {plan.description && (
                          <p className="mt-1.5 text-sm text-earth-600">{plan.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-earth-600">
                          <span>{plan.sessionCount} 堂</span>
                          {avgPerSession > 0 && plan.sessionCount > 1 && (
                            <span>均 NT$ {avgPerSession.toLocaleString()}/堂</span>
                          )}
                          {plan.validityDays && <span>{plan.validityDays} 天有效</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xl font-bold text-primary-700">
                          NT$ {price.toLocaleString()}
                        </div>
                        <div className="mt-1 text-sm text-primary-700">購買 →</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* 匯款資訊 + LINE 聯繫 */}
          {(shopConfig?.bankAccountNumber || shopConfig?.lineOfficialUrl) && (
            <div className="mt-5 rounded-2xl border border-primary-200 bg-primary-50/60 p-5">
              {shopConfig?.bankAccountNumber && (
                <>
                  <p className="text-base font-semibold text-primary-900">匯款資訊</p>
                  <div className="mt-2 space-y-1 text-base text-earth-800">
                    {shopConfig.bankName && (
                      <p>
                        銀行：<span className="font-medium">{shopConfig.bankName}</span>
                        {shopConfig.bankCode && (
                          <span className="ml-1 font-mono text-earth-700">({shopConfig.bankCode})</span>
                        )}
                      </p>
                    )}
                    <p>
                      帳號：<span className="font-mono font-semibold">{shopConfig.bankAccountNumber}</span>
                    </p>
                  </div>
                </>
              )}
              {shopConfig?.lineOfficialUrl && (
                <a
                  href={shopConfig.lineOfficialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#06C755] text-base font-semibold text-white shadow-sm transition hover:bg-[#05b54d] active:scale-[0.98] ${shopConfig?.bankAccountNumber ? "mt-4" : ""}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                  聯繫店長（LINE）
                </a>
              )}
            </div>
          )}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {tab === "upcoming" ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600"><path d="M6.75 3v2.25M17.25 3v2.25" /><path d="M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
              </div>
              <p className="text-lg font-semibold text-earth-900">還沒有預約</p>
              <p className="mt-2 text-base text-earth-700">選擇一個時段，開始你的療程吧</p>
              <Link
                href={`${prefix}/book/new`}
                className="mt-5 inline-flex min-h-[48px] items-center gap-1.5 rounded-xl bg-primary-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-primary-700"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 4.5v15m7.5-7.5h-15" /></svg>
                預約第一堂
              </Link>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-earth-100">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-earth-600"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-lg font-semibold text-earth-900">尚無歷史紀錄</p>
              <p className="mt-2 text-base text-earth-700">完成的預約會顯示在這裡</p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-earth-200 bg-white overflow-hidden">
          {displayed.map((b, idx) => (
            <div
              key={b.id}
              className={`px-4 py-4 ${
                idx > 0 ? "border-t border-earth-100" : ""
              } ${b.bookingStatus === "CANCELLED" ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                {/* Date + time */}
                <div className="flex-shrink-0">
                  <div className="text-base font-semibold text-earth-900">
                    {new Date(b.bookingDate).toLocaleDateString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </div>
                  <div className="mt-1 text-lg font-bold text-primary-700">{b.slotTime}</div>
                </div>

                {/* Info tags */}
                <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-earth-700 min-w-0">
                  {b.people > 1 && <span className="font-medium">{b.people}位</span>}
                  {b.people > 1 && <span className="text-earth-400">·</span>}
                  <span className="truncate">{BOOKING_TYPE_LABEL[b.bookingType] ?? b.bookingType}</span>
                  {b.isMakeup && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-800">
                      補課
                    </span>
                  )}
                  {b.revenueStaff && (
                    <span className="hidden sm:flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: b.revenueStaff.colorCode }}
                      />
                      <span className="text-sm">{b.revenueStaff.displayName}</span>
                    </span>
                  )}
                </div>

                {/* Status + action */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${STATUS_COLOR[b.bookingStatus] ?? ""}`}>
                    {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                  </span>
                  {(b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED") && (() => {
                    const dateStr = new Date(b.bookingDate).toISOString().slice(0, 10);
                    const [h, m] = b.slotTime.split(":").map(Number);
                    const bookingTime = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+08:00`);
                    const hoursLeft = (bookingTime.getTime() - Date.now()) / (1000 * 60 * 60);
                    const canCancel = hoursLeft >= 12;

                    return canCancel ? (
                      <Link
                        href={`${prefix}/my-bookings/${b.id}/cancel`}
                        className="flex min-h-[32px] items-center rounded-md px-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:underline"
                      >
                        取消
                      </Link>
                    ) : (
                      <span
                        className="text-sm text-earth-500 cursor-not-allowed"
                        title="開課前 12 小時內無法取消"
                      >
                        取消
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
