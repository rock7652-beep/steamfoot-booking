import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getStoreContext } from "@/lib/store-context";
import { listBookings } from "@/server/queries/booking";
import { getHealthCardData } from "@/server/queries/health-card";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";
import { redirect } from "next/navigation";
import Link from "next/link";
import { HealthAssessmentCard } from "@/components/health-assessment-card";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  BOOKING_TYPE_LABEL,
  isBookingPast,
  PENDING_STATUSES,
} from "@/lib/booking-constants";

interface PageProps {
  searchParams: Promise<{ tab?: "upcoming" | "history" }>;
}

export default async function MyBookingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const tab = params.tab ?? "upcoming";
  const storeCtx = await getStoreContext();
  const prefix = `/s/${storeCtx?.storeSlug ?? "zhubei"}`;

  // 與 /my-plans 同一份 resolver，避免 session.customerId stale 時方案卡片顯示 0
  const resolved = await resolveCustomerForUser({
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId: user.storeId ?? storeCtx?.storeId ?? null,
    storeSlug: storeCtx?.storeSlug ?? null,
  });
  const customerId = resolved.customer?.id ?? null;
  if (!customerId) redirect("/");

  // 並行取預約 + 健康卡片 + 方案錢包（供頂部方案摘要顯示）
  const [{ bookings }, healthCard, planSummary] = await Promise.all([
    listBookings({ pageSize: 50 }),
    getHealthCardData(customerId),
    prisma.customerPlanWallet.findMany({
      where: { customerId, status: "ACTIVE" },
      select: { remainingSessions: true },
    }),
  ]);

  const totalRemaining = planSummary.reduce((s, w) => s + w.remainingSessions, 0);
  const hasSessions = totalRemaining > 0;

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
            href={`${prefix}/book/shop`}
            className="flex min-h-[44px] items-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-primary-700 transition"
          >
            購買方案
          </Link>
        )}
      </div>

      {/* 方案摘要 — 整張卡可點，導到 /my-plans */}
      <Link
        href={`${prefix}/my-plans`}
        className="mb-5 block rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition hover:bg-earth-50/40"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            {hasSessions ? (
              <>
                <p className="text-sm font-medium text-earth-700">目前可預約</p>
                <p className="mt-1">
                  <span className="text-3xl font-bold text-primary-700">{totalRemaining}</span>
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
            查看我的方案
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
      </div>

      {/* Booking list */}
      {displayed.length === 0 ? (
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
