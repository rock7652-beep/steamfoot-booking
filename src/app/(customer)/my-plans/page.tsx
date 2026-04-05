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
        include: { plan: { select: { name: true, category: true, sessionCount: true } } },
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
  };
  isActive: boolean;
}) {
  const progressPct = Math.round(
    ((wallet.totalSessions - wallet.remainingSessions) / wallet.totalSessions) * 100
  );

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
          <span className="text-2xl font-bold text-primary-700">{wallet.remainingSessions}</span>
          <span className="text-sm text-earth-400"> / {wallet.totalSessions} 堂</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-earth-100">
        <div
          className={`h-1.5 rounded-full transition-all ${
            isActive ? "bg-primary-500" : "bg-earth-300"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

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
