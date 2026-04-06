import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { WalletStatus } from "@prisma/client";

const WALLET_STATUS_LABEL: Record<WalletStatus, string> = {
  ACTIVE: "有效",
  USED_UP: "已用完",
  EXPIRED: "已過期",
  CANCELLED: "已取消",
};

const CATEGORY_LABEL: Record<string, string> = {
  TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE: "課程",
};

export default async function MyPlansPage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const customer = await prisma.customer.findUnique({
    where: { id: user.customerId },
    include: {
      planWallets: {
        include: {
          plan: { select: { name: true, category: true, sessionCount: true } },
          bookings: {
            where: { bookingStatus: { in: ["COMPLETED", "NO_SHOW", "CONFIRMED", "PENDING"] } },
            select: { bookingDate: true, slotTime: true, bookingStatus: true, isMakeup: true, people: true },
            orderBy: { bookingDate: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) redirect("/");

  const activeWallets = customer.planWallets.filter((w) => w.status === "ACTIVE");
  const inactiveWallets = customer.planWallets.filter((w) => w.status !== "ACTIVE");

  // P0-2 修正：使用 wallet.remainingSessions 作為唯一真值來源
  // remainingSessions 由 createBooking 預扣、cancelBooking 退還，是 DB 層級的正確值
  const totalRemaining = activeWallets.reduce((sum, w) => sum + w.remainingSessions, 0);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">&larr;</Link>
        <h1 className="text-xl font-bold text-earth-900">我的方案</h1>
      </div>

      {/* Summary — 主敘事：剩餘可預約最醒目 */}
      {activeWallets.length > 0 && (() => {
        // P0-2: 已預約未用 = 各 wallet 的 CONFIRMED/PENDING 筆數（每筆預扣 1 堂）
        const totalPreDeducted = activeWallets.reduce((sum, w) => {
          return sum + w.bookings
            .filter((b) => !b.isMakeup && (b.bookingStatus === "CONFIRMED" || b.bookingStatus === "PENDING"))
            .length;
        }, 0);
        return (
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-earth-500">你還有</p>
            <p className="mt-0.5 text-3xl font-bold text-primary-700">
              {totalRemaining} <span className="text-base font-medium text-earth-400">堂可以預約</span>
            </p>
            {totalPreDeducted > 0 && (
              <p className="mt-1.5 text-sm text-earth-500">
                其中 <strong className="text-blue-600">{totalPreDeducted}</strong> 堂已預約、尚未使用
              </p>
            )}
            <div className="mt-3 flex items-center gap-3">
              {customer.selfBookingEnabled ? (
                <Link
                  href="/book/new"
                  className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
                >
                  立即預約
                </Link>
              ) : (
                <p className="text-xs text-yellow-600">自助預約功能由店長開啟，請聯繫店長</p>
              )}
            </div>
          </div>
        );
      })()}

      {customer.planWallets.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-earth-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-earth-400"><path d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6z" /><path d="M21 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6" /></svg>
          </div>
          <p className="text-sm font-medium text-earth-700">尚未購買課程</p>
          <p className="mt-1 text-xs text-earth-400">請聯繫您的直屬店長購買課程方案</p>
          <Link
            href="/book"
            className="mt-4 inline-block rounded-lg border border-earth-200 px-4 py-2 text-sm text-earth-600 transition hover:bg-earth-50"
          >
            返回首頁
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active wallets */}
          {activeWallets.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-earth-700">有效課程</h2>
              <div className="space-y-3">
                {activeWallets.map((w) => (
                  <WalletCard key={w.id} wallet={w} isActive />
                ))}
              </div>
            </section>
          )}

          {/* Inactive wallets */}
          {inactiveWallets.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-earth-500">歷史課程</h2>
              <div className="space-y-3 opacity-60">
                {inactiveWallets.map((w) => (
                  <WalletCard key={w.id} wallet={w} isActive={false} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* CTA 已移至頂部摘要區塊 */}
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
    bookings: { bookingDate: Date; slotTime: string; bookingStatus: string; isMakeup: boolean; people: number }[];
  };
  isActive: boolean;
}) {
  // ── P0-2 修正：以 wallet.remainingSessions 為唯一真值來源 ──
  // remainingSessions 由 createBooking 預扣（-1/筆）、cancelBooking 退還（+1/筆）
  // 已預扣 = 仍有效的 CONFIRMED + PENDING 筆數
  const preDeductedBookings = wallet.bookings.filter(
    (b) => !b.isMakeup && (b.bookingStatus === "CONFIRMED" || b.bookingStatus === "PENDING")
  );
  const preDeductedCount = preDeductedBookings.length;

  // 已使用 = 總堂數 - 剩餘堂數 - 已預扣（= 已完成 + 未到的堂數）
  const remainingBookable = wallet.remainingSessions;
  const usedCount = wallet.totalSessions - wallet.remainingSessions - preDeductedCount;

  // 用於顯示使用紀錄格子
  const usedBookings = wallet.bookings.filter(
    (b) => !b.isMakeup && (b.bookingStatus === "COMPLETED" || b.bookingStatus === "NO_SHOW")
  );

  const progressPct = wallet.totalSessions > 0 ? Math.round(((wallet.totalSessions - wallet.remainingSessions) / wallet.totalSessions) * 100) : 0;

  return (
    <div className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      {/* Header: name + remaining big number */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-earth-900">{wallet.plan.name}</span>
            <span className="rounded-md bg-earth-100 px-1.5 py-0.5 text-[10px] text-earth-500">
              {CATEGORY_LABEL[wallet.plan.category] ?? wallet.plan.category}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-primary-700">{remainingBookable}</span>
          <span className="text-xs text-earth-400"> / {wallet.totalSessions}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2.5 h-1.5 w-full rounded-full bg-earth-100">
        <div
          className={`h-1.5 rounded-full transition-all ${
            isActive ? "bg-primary-500" : "bg-earth-300"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* 堂數明細 — 三欄精簡版 */}
      <div className="mt-2.5 flex items-center gap-4 text-xs text-earth-500">
        <span>已使用 <strong className="text-earth-700">{usedCount}</strong></span>
        <span>已預約未用 <strong className="text-blue-600">{preDeductedCount}</strong></span>
        <span>可預約 <strong className="text-primary-700">{remainingBookable}</strong></span>
      </div>

      {/* Session usage grid — 依人數展開格子（COMPLETED / NO_SHOW） */}
      {wallet.totalSessions > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium text-earth-400 uppercase tracking-wider">使用紀錄</p>
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              // 把每筆已使用預約依 people 數展開成多個格子
              const usedCells: { dateLabel: string; slotTime: string; isNoShow: boolean; people: number; index: number }[] = [];
              for (const b of usedBookings) {
                const dateLabel = new Date(b.bookingDate).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
                const isNoShow = b.bookingStatus === "NO_SHOW";
                for (let p = 0; p < b.people; p++) {
                  usedCells.push({ dateLabel, slotTime: b.slotTime, isNoShow, people: b.people, index: p });
                }
              }
              return Array.from({ length: wallet.totalSessions }, (_, i) => {
                const cell = usedCells[i];
                if (cell) {
                  return (
                    <div
                      key={i}
                      className={`flex h-8 min-w-[3rem] items-center justify-center rounded-md px-1.5 text-[10px] font-medium ${
                        cell.isNoShow ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"
                      }`}
                      title={`${cell.dateLabel} ${cell.slotTime} ${cell.isNoShow ? "未到" : "已完成"}${cell.people > 1 ? ` (${cell.people}位)` : ""}`}
                    >
                      {cell.dateLabel}
                      {cell.people > 1 && cell.index === 0 && <span className="ml-0.5 text-[8px] opacity-70">×{cell.people}</span>}
                      {cell.isNoShow && <span className="ml-0.5">!</span>}
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-earth-200 text-[10px] text-earth-300"
                  >
                    {i + 1}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-earth-400">
        <span>{new Date(wallet.startDate).toLocaleDateString("zh-TW")} ~ {wallet.expiryDate ? new Date(wallet.expiryDate).toLocaleDateString("zh-TW") : "無期限"}</span>
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${
          wallet.status === "ACTIVE"
            ? "bg-green-50 text-green-600"
            : "bg-earth-100 text-earth-500"
        }`}>
          {WALLET_STATUS_LABEL[wallet.status]}
        </span>
      </div>
    </div>
  );
}
