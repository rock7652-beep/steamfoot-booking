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
  PACKAGE: "套餐",
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
            select: { bookingDate: true, slotTime: true, bookingStatus: true, isMakeup: true },
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
  const totalRemaining = activeWallets.reduce((s, w) => s + w.remainingSessions, 0);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">&larr;</Link>
        <h1 className="text-xl font-bold text-earth-900">我的方案</h1>
      </div>

      {/* Summary */}
      {activeWallets.length > 0 && (
        <div className="mb-6 rounded-xl border border-primary-100 bg-primary-50 px-5 py-4">
          <p className="text-sm text-primary-700">
            有效課程 <strong>{activeWallets.length}</strong> 份，
            共剩餘 <strong className="text-xl text-primary-800">{totalRemaining}</strong> 堂
          </p>
          {customer.selfBookingEnabled ? (
            <p className="mt-1 text-xs text-primary-500">✓ 已開放自助預約</p>
          ) : (
            <p className="mt-1 text-xs text-yellow-600">
              ⚠ 自助預約功能由店長開啟，請聯繫店長
            </p>
          )}
        </div>
      )}

      {customer.planWallets.length === 0 ? (
        <div className="py-12 text-center text-earth-400">
          <div className="mb-2 text-3xl">🌱</div>
          <p className="text-sm">尚未購買課程</p>
          <p className="mt-1 text-xs text-earth-400">請聯繫您的直屬店長購買課程方案</p>
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

      {/* CTA */}
      {totalRemaining > 0 && customer.selfBookingEnabled && (
        <div className="mt-8 text-center">
          <Link
            href="/book/new"
            className="rounded-xl bg-primary-600 px-8 py-3 text-sm font-semibold text-white hover:bg-primary-700"
          >
            立即預約
          </Link>
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
    bookings: { bookingDate: Date; slotTime: string; bookingStatus: string; isMakeup: boolean }[];
  };
  isActive: boolean;
}) {
  // ── 分類計算 ──
  // 已使用 = COMPLETED + NO_SHOW（非補課），這些真正消耗了堂數
  const usedBookings = wallet.bookings.filter(
    (b) => !b.isMakeup && (b.bookingStatus === "COMPLETED" || b.bookingStatus === "NO_SHOW")
  );
  const usedCount = usedBookings.length;

  // 已預扣待使用 = CONFIRMED + PENDING（非補課），已扣堂但還沒到店
  const preDeductedCount = wallet.bookings.filter(
    (b) => !b.isMakeup && (b.bookingStatus === "CONFIRMED" || b.bookingStatus === "PENDING")
  ).length;

  // 剩餘可預約 = remainingSessions - preDeductedCount（理論上 remainingSessions 已經扣除 preDeducted）
  // 但 remainingSessions = totalSessions - usedCount - preDeductedCount，所以直接用它
  const remainingBookable = wallet.remainingSessions;

  const progressPct = Math.round((usedCount / wallet.totalSessions) * 100);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-earth-900">{wallet.plan.name}</span>
            <span className="rounded bg-earth-100 px-1.5 py-0.5 text-xs text-earth-600">
              {CATEGORY_LABEL[wallet.plan.category] ?? wallet.plan.category}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-earth-400">
            購入 NT$ {Number(wallet.purchasedPrice).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-primary-700">{remainingBookable}</span>
          <span className="text-sm text-earth-400"> / {wallet.totalSessions} 堂</span>
        </div>
      </div>

      {/* 堂數摘要 */}
      <div className="mt-2 grid grid-cols-4 gap-1 text-center">
        <div className="rounded-md bg-earth-50 px-1 py-1.5">
          <p className="text-lg font-bold text-earth-700">{wallet.totalSessions}</p>
          <p className="text-[10px] text-earth-400">總堂數</p>
        </div>
        <div className="rounded-md bg-green-50 px-1 py-1.5">
          <p className="text-lg font-bold text-green-700">{usedCount}</p>
          <p className="text-[10px] text-green-500">已使用</p>
        </div>
        <div className="rounded-md bg-blue-50 px-1 py-1.5">
          <p className="text-lg font-bold text-blue-600">{preDeductedCount}</p>
          <p className="text-[10px] text-blue-400">已預扣待使用</p>
        </div>
        <div className="rounded-md bg-primary-50 px-1 py-1.5">
          <p className="text-lg font-bold text-primary-700">{remainingBookable}</p>
          <p className="text-[10px] text-primary-400">剩餘可預約</p>
        </div>
      </div>

      {/* Progress bar — 只反映已使用比例 */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-earth-100">
        <div
          className={`h-1.5 rounded-full transition-all ${
            isActive ? "bg-primary-500" : "bg-earth-300"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Session usage grid — 只顯示已使用（COMPLETED / NO_SHOW） */}
      {wallet.totalSessions > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium text-earth-400 uppercase tracking-wider">使用紀錄</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: wallet.totalSessions }, (_, i) => {
              const booking = usedBookings[i];
              if (booking) {
                const dateLabel = new Date(booking.bookingDate).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
                const isNoShow = booking.bookingStatus === "NO_SHOW";
                return (
                  <div
                    key={i}
                    className={`flex h-8 min-w-[3rem] items-center justify-center rounded-md px-1.5 text-[10px] font-medium ${
                      isNoShow ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"
                    }`}
                    title={`${dateLabel} ${booking.slotTime} ${isNoShow ? "未到" : "已完成"}`}
                  >
                    {dateLabel}
                    {isNoShow && <span className="ml-0.5">!</span>}
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
            })}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-xs text-earth-400">
        <span>開始 {new Date(wallet.startDate).toLocaleDateString("zh-TW")}</span>
        <div className="flex items-center gap-2">
          {wallet.expiryDate && (
            <span>到期 {new Date(wallet.expiryDate).toLocaleDateString("zh-TW")}</span>
          )}
          <span className={`rounded px-1.5 py-0.5 ${
            wallet.status === "ACTIVE"
              ? "bg-green-100 text-green-700"
              : "bg-earth-100 text-earth-500"
          }`}>
            {WALLET_STATUS_LABEL[wallet.status]}
          </span>
        </div>
      </div>
    </div>
  );
}
