import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { prisma } from "@/lib/db";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";
import Link from "next/link";
import type { WalletStatus } from "@prisma/client";
import {
  WALLET_STATUS_LABEL,
  PLAN_CATEGORY_LABEL,
  PENDING_STATUSES,
} from "@/lib/booking-constants";
import { NoPlanEmptyState } from "@/components/no-plan-empty-state";

export default async function MyPlansPage() {
  const user = await getCurrentUser();
  const storeCtx = await getStoreContext();
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";
  const prefix = `/s/${storeSlug}`;
  const shopHref = `${prefix}/book/shop`;

  if (!user) {
    return <NoPlanEmptyState title="我的方案" variant="plan" shopHref={shopHref} />;
  }

  // session.customerId 可能 stale（顧客被 merge / staff 後建 / userId 還沒回填），
  // 直接用會看不到後台剛指派的方案。走 resolver（與 /profile 同一份邏輯）拿 canonical customerId。
  const resolved = await resolveCustomerForUser({
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId: user.storeId ?? storeCtx?.storeId ?? null,
    storeSlug: storeCtx?.storeSlug ?? null,
  });
  const customerId = resolved.customer?.id ?? null;
  if (!customerId) {
    return <NoPlanEmptyState title="我的方案" variant="plan" shopHref={shopHref} />;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      planWallets: {
        include: {
          plan: { select: { name: true, category: true, sessionCount: true } },
          bookings: {
            where: { bookingStatus: { in: ["COMPLETED", "NO_SHOW", "CONFIRMED", "PENDING"] } },
            select: {
              bookingDate: true,
              slotTime: true,
              bookingStatus: true,
              isMakeup: true,
              people: true,
              noShowPolicy: true,
            },
            orderBy: { bookingDate: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) {
    return <NoPlanEmptyState title="我的方案" variant="plan" shopHref={shopHref} />;
  }

  // ── 3 區分類 ──
  const activeWallets = customer.planWallets.filter((w) => w.status === "ACTIVE");
  const expiredWallets = customer.planWallets.filter((w) => w.status === "EXPIRED");
  const historyWallets = customer.planWallets.filter(
    (w) => w.status === "USED_UP" || w.status === "CANCELLED"
  );

  // ── 新扣堂模型：remainingSessions = 購買 - COMPLETED - NO_SHOW(DEDUCTED) ──
  // 可預約堂數 = remainingSessions - count(PENDING bookings that aren't makeup)
  const totalRemaining = activeWallets.reduce((sum, w) => sum + w.remainingSessions, 0);
  const totalPendingCount = activeWallets.reduce((sum, w) => {
    return sum + w.bookings
      .filter((b) => !b.isMakeup && (PENDING_STATUSES as readonly string[]).includes(b.bookingStatus))
      .length;
  }, 0);
  const availableToBook = Math.max(0, totalRemaining - totalPendingCount);

  // 再依體驗 vs 課程分組
  const activeTrialWallets = activeWallets.filter((w) => w.plan.category === "TRIAL");
  const activePackageWallets = activeWallets.filter((w) => w.plan.category !== "TRIAL");

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`${prefix}/book`} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700 hover:text-earth-900 lg:hidden">&larr;</Link>
        <h1 className="text-2xl font-bold text-earth-900">我的方案</h1>
      </div>

      {/* Summary */}
      {activeWallets.length > 0 && (
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p className="text-base font-medium text-earth-700">你還有</p>
          <p className="mt-1 text-4xl font-bold text-primary-700">
            {availableToBook} <span className="text-lg font-medium text-earth-700">堂可以預約</span>
          </p>
          {totalPendingCount > 0 && (
            <p className="mt-2 text-base text-earth-800">
              其中 <strong className="text-blue-700">{totalPendingCount}</strong> 堂已預約、等待到店
            </p>
          )}
          {availableToBook < totalRemaining && (
            <p className="mt-1 text-sm text-earth-700">
              剩餘堂數 {totalRemaining}（含已預約未用 {totalPendingCount}）
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            {/* v2：有可用堂數即顯示預約入口；selfBookingEnabled 不再參與入口判斷 */}
            <Link
              href={`${prefix}/book/new`}
              className="flex min-h-[48px] items-center justify-center rounded-xl bg-primary-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              立即預約
            </Link>
          </div>
        </div>
      )}

      {customer.planWallets.length === 0 ? (
        <NoPlanEmptyState variant="plan" shopHref={shopHref} />
      ) : (
        <div className="space-y-6">
          {/* ── 有效課程 ── */}
          {activePackageWallets.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-earth-900">有效課程</h2>
              <div className="space-y-3">
                {activePackageWallets.map((w) => (
                  <WalletCard key={w.id} wallet={w} isActive />
                ))}
              </div>
            </section>
          )}

          {/* ── 有效體驗 ── */}
          {activeTrialWallets.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-earth-900">體驗方案</h2>
              <div className="space-y-3">
                {activeTrialWallets.map((w) => (
                  <WalletCard key={w.id} wallet={w} isActive />
                ))}
              </div>
            </section>
          )}

          {/* ── 已過期 ── */}
          {expiredWallets.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-earth-700">已過期</h2>
              <div className="space-y-3 opacity-70">
                {expiredWallets.map((w) => (
                  <WalletCard key={w.id} wallet={w} isActive={false} />
                ))}
              </div>
            </section>
          )}

          {/* ── 已用完 / 已取消 ── */}
          {historyWallets.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-earth-700">歷史課程</h2>
              <div className="space-y-3 opacity-70">
                {historyWallets.map((w) => (
                  <WalletCard key={w.id} wallet={w} isActive={false} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function WalletCard({
  wallet,
  isActive,
}: {
  wallet: {
    id: string;
    plan: { name: string; category: string; sessionCount: number };
    purchasedPrice: unknown;
    totalSessions: number;
    remainingSessions: number;
    startDate: Date;
    expiryDate: Date | null;
    status: WalletStatus;
    bookings: {
      bookingDate: Date;
      slotTime: string;
      bookingStatus: string;
      isMakeup: boolean;
      people: number;
      noShowPolicy: string | null;
    }[];
  };
  isActive: boolean;
}) {
  // ── 新扣堂模型 ──
  // remainingSessions = totalSessions - COMPLETED count - NO_SHOW(DEDUCTED) count
  // 已預約待到店 = PENDING + CONFIRMED（非補課）
  const pendingBookings = wallet.bookings.filter(
    (b) => !b.isMakeup && (PENDING_STATUSES as readonly string[]).includes(b.bookingStatus)
  );
  const pendingCount = pendingBookings.length;

  // 已消耗 = COMPLETED + NO_SHOW(DEDUCTED)
  const completedCount = wallet.bookings.filter(
    (b) => !b.isMakeup && b.bookingStatus === "COMPLETED"
  ).length;
  const noShowDeductedCount = wallet.bookings.filter(
    (b) => !b.isMakeup && b.bookingStatus === "NO_SHOW" && b.noShowPolicy === "DEDUCTED"
  ).length;
  const usedCount = completedCount + noShowDeductedCount;

  // 可預約 = remainingSessions - 待到店筆數
  const availableToBook = Math.max(0, wallet.remainingSessions - pendingCount);

  // 已使用紀錄（含 COMPLETED + 所有 NO_SHOW）
  const usedBookings = wallet.bookings.filter(
    (b) => !b.isMakeup && (b.bookingStatus === "COMPLETED" || b.bookingStatus === "NO_SHOW")
  );

  const progressPct = wallet.totalSessions > 0
    ? Math.round(((wallet.totalSessions - wallet.remainingSessions) / wallet.totalSessions) * 100)
    : 0;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      {/* Header: name + remaining big number */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-earth-900">{wallet.plan.name}</span>
            <span className="rounded-md bg-earth-100 px-2 py-0.5 text-sm font-medium text-earth-800">
              {PLAN_CATEGORY_LABEL[wallet.plan.category] ?? wallet.plan.category}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold text-primary-700">{wallet.remainingSessions}</span>
          <span className="text-base text-earth-700"> / {wallet.totalSessions}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full rounded-full bg-earth-100">
        <div
          className={`h-2 rounded-full transition-all ${
            isActive ? "bg-primary-500" : "bg-earth-400"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* 堂數明細 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-earth-700">
        <span>已使用 <strong className="text-earth-900">{usedCount}</strong></span>
        {pendingCount > 0 && (
          <span>待到店 <strong className="text-blue-700">{pendingCount}</strong></span>
        )}
        <span>可預約 <strong className="text-primary-700">{availableToBook}</strong></span>
      </div>

      {/* Session usage grid */}
      {wallet.totalSessions > 0 && usedBookings.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-earth-700">使用紀錄</p>
          <div className="flex flex-wrap gap-2">
            {usedBookings.map((b, i) => {
              const dateLabel = new Date(b.bookingDate).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
              const isNoShow = b.bookingStatus === "NO_SHOW";
              const isDeducted = isNoShow && b.noShowPolicy === "DEDUCTED";
              return (
                <div
                  key={i}
                  className={`flex h-9 min-w-[3.5rem] items-center justify-center rounded-md px-2 text-sm font-medium ${
                    isNoShow
                      ? isDeducted
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                      : "bg-green-100 text-green-800"
                  }`}
                  title={`${dateLabel} ${b.slotTime} ${
                    isNoShow ? (isDeducted ? "未到(扣堂)" : "未到(不扣堂)") : "出席"
                  }`}
                >
                  {dateLabel}
                  {isNoShow && <span className="ml-1">{isDeducted ? "!" : "↩"}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-earth-700">
        <span>{new Date(wallet.startDate).toLocaleDateString("zh-TW")} ~ {wallet.expiryDate ? new Date(wallet.expiryDate).toLocaleDateString("zh-TW") : "無期限"}</span>
        <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${
          wallet.status === "ACTIVE"
            ? "bg-green-50 text-green-700"
            : "bg-earth-100 text-earth-800"
        }`}>
          {WALLET_STATUS_LABEL[wallet.status] ?? wallet.status}
        </span>
      </div>
    </div>
  );
}
