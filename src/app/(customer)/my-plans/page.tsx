import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { prisma } from "@/lib/db";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";
import { AppLink as Link } from "@/components/app-link";
import type { WalletStatus } from "@prisma/client";
import {
  WALLET_STATUS_LABEL,
  PLAN_CATEGORY_LABEL,
} from "@/lib/booking-constants";
import {
  walletPendingCount,
  walletAvailableToBook,
  totalAvailableToBook,
  ledgerUsage,
} from "@/lib/wallet-availability";
import { NoPlanEmptyState } from "@/components/no-plan-empty-state";
import {
  WalletSessionDetail,
  type SessionRow,
} from "@/components/wallet-session-detail";
import { PlanUsageGrid } from "@/components/admin/plan-usage-grid";
import { walletPlanProgress } from "@/lib/wallet-plan-progress";
import { toLocalDateStr } from "@/lib/date-utils";

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
          sessions: {
            orderBy: { sessionNo: "asc" },
            include: {
              booking: { select: { bookingDate: true, slotTime: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) {
    return <NoPlanEmptyState title="我的方案" variant="plan" shopHref={shopHref} />;
  }

  // ── 補課資格（PR-NoShow-2b）：有效券（未使用、未過期），最早到期優先 ──
  const storeId = user.storeId ?? storeCtx?.storeId ?? null;
  const makeupCredits = await prisma.makeupCredit.findMany({
    where: {
      customerId,
      ...(storeId ? { storeId } : {}),
      isUsed: false,
      OR: [{ expiredAt: null }, { expiredAt: { gte: new Date() } }],
    },
    select: { id: true, expiredAt: true },
    orderBy: [{ expiredAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  // ── 3 區分類 ──
  const activeWallets = customer.planWallets.filter((w) => w.status === "ACTIVE");
  const expiredWallets = customer.planWallets.filter((w) => w.status === "EXPIRED");
  const historyWallets = customer.planWallets.filter(
    (w) => w.status === "USED_UP" || w.status === "CANCELLED"
  );

  // ── 新扣堂模型：remainingSessions = 購買 - COMPLETED - NO_SHOW(DEDUCTED) ──
  // 可預約堂數 = remainingSessions - count(PENDING bookings that aren't makeup)
  const totalRemaining = activeWallets.reduce((sum, w) => sum + w.remainingSessions, 0);
  const totalPendingCount = activeWallets.reduce((sum, w) => sum + walletPendingCount(w), 0);
  const availableToBook = totalAvailableToBook(activeWallets);

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
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
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

      {/* ── 補課資格（PR-NoShow-2b）── */}
      {makeupCredits.length > 0 && (
        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-amber-900">補課資格</h2>
            <span className="text-sm font-semibold text-amber-800">
              {makeupCredits.length} 張可用
            </span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {makeupCredits.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between text-sm text-amber-900"
              >
                <span>補課資格 1 次</span>
                <span className="text-amber-700">
                  {c.expiredAt
                    ? `有效期限至 ${toLocalDateStr(c.expiredAt).split("-").join("/")}`
                    : "無使用期限"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-amber-700">
            系統會於預約時自動優先使用補課資格（最早到期優先），不扣原方案堂數。
          </p>
        </section>
      )}

      {customer.planWallets.length === 0 && makeupCredits.length === 0 ? (
        <NoPlanEmptyState variant="plan" shopHref={shopHref} />
      ) : (
        <div className="space-y-6">
          {/* ── 有效課程 ── */}
          {activePackageWallets.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-earth-900">有效課程</h2>
              <div className="space-y-3">
                {activePackageWallets.map((w) => (
                  <WalletCard key={w.id} wallet={w} />
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
                  <WalletCard key={w.id} wallet={w} />
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
                  <WalletCard key={w.id} wallet={w} />
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
                  <WalletCard key={w.id} wallet={w} />
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
}: {
  wallet: {
    id: string;
    plan: { name: string; category: string; sessionCount: number };
    purchasedPrice: unknown;
    totalSessions: number;
    remainingSessions: number;
    createdAt: Date;
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
    sessions: SessionRow[];
  };
}) {
  // ── canonical：全部走 wallet-availability helper，與首頁 / my-plans 上方 / booking form 一致 ──
  const pendingCount = walletPendingCount(wallet);
  const availableToBook = walletAvailableToBook(wallet);
  // 已使用 / 已註銷 由 WalletSession ledger 推導（含 BACKFILLED 補登；VOIDED 獨立呈現）
  const { used: usedCount, voided: voidedCount } = ledgerUsage(wallet.sessions);

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

      {/* 堂數明細 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-earth-700">
        <span>已使用 <strong className="text-earth-900">{usedCount}</strong></span>
        {pendingCount > 0 && (
          <span>待到店 <strong className="text-blue-700">{pendingCount}</strong></span>
        )}
        <span>可預約 <strong className="text-primary-700">{availableToBook}</strong></span>
        {voidedCount > 0 && (
          <span>已註銷 <strong className="text-earth-900">{voidedCount}</strong></span>
        )}
      </div>

      <PlanUsageGrid progress={walletPlanProgress(wallet)} unitLabel="堂" />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-earth-700">
        <span>購買 {toLocalDateStr(wallet.createdAt)} · NT$ {Number(wallet.purchasedPrice).toLocaleString()} · 到期 {wallet.expiryDate ? new Date(wallet.expiryDate).toLocaleDateString("zh-TW") : "無期限"}</span>
        <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${
          wallet.status === "ACTIVE"
            ? "bg-green-50 text-green-700"
            : "bg-earth-100 text-earth-800"
        }`}>
          {WALLET_STATUS_LABEL[wallet.status] ?? wallet.status}
        </span>
      </div>

      {wallet.sessions.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-sm font-semibold text-earth-700 hover:text-earth-900">
            <span className="group-open:hidden">查看堂數明細 ▾</span>
            <span className="hidden group-open:inline">收合堂數明細 ▴</span>
          </summary>
          <div className="mt-2">
            <WalletSessionDetail sessions={wallet.sessions} />
          </div>
        </details>
      )}
    </div>
  );
}
