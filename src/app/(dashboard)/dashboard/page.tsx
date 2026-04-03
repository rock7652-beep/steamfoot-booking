import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";

// 取得後台首頁的統計數字
async function getDashboardStats(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return null;

  if (user.role === "OWNER") {
    const [customerCount, activeCount, todayBookings, monthRevenue] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { customerStage: "ACTIVE" } }),
      prisma.booking.count({
        where: {
          bookingDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
      prisma.transaction.aggregate({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
          transactionType: { in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE"] },
        },
        _sum: { amount: true },
      }),
    ]);
    return { customerCount, activeCount, todayBookings, monthRevenue: Number(monthRevenue._sum.amount ?? 0) };
  }

  if (user.role === "MANAGER" && user.staffId) {
    const [customerCount, activeCount, todayBookings] = await Promise.all([
      prisma.customer.count({ where: { assignedStaffId: user.staffId } }),
      prisma.customer.count({
        where: { assignedStaffId: user.staffId, customerStage: "ACTIVE" },
      }),
      prisma.booking.count({
        where: {
          customer: { assignedStaffId: user.staffId },
          bookingDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
    ]);
    return { customerCount, activeCount, todayBookings, monthRevenue: null };
  }

  return null;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const stats = await getDashboardStats(user);

  const isOwner = user?.role === "OWNER";

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-gray-900">
        歡迎回來，{user?.name}
      </h2>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="名下顧客" value={stats.customerCount} unit="位" />
          <StatCard label="有效課程顧客" value={stats.activeCount} unit="位" />
          <StatCard label="今日預約" value={stats.todayBookings} unit="筆" />
          {isOwner && stats.monthRevenue !== null && (
            <StatCard
              label="本月營收"
              value={`$${stats.monthRevenue.toLocaleString()}`}
              unit=""
            />
          )}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-700">快速入口</h3>
        <div className="flex flex-wrap gap-3">
          <QuickLink href="/dashboard/customers" label="顧客管理" />
          <QuickLink href="/dashboard/bookings" label="預約管理" />
          <QuickLink href="/dashboard/plans" label="課程方案" />
          <QuickLink href="/dashboard/transactions" label="交易紀錄" />
          <QuickLink href="/dashboard/cashbook" label="現金帳" />
          {isOwner && <QuickLink href="/dashboard/staff" label="店長管理" />}
          <QuickLink href="/dashboard/reports" label="報表" />
        </div>
      </div>

      {/* Debug session info - only show in development */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-8 rounded-xl border border-dashed border-gray-300 p-4 text-xs text-gray-400">
          <summary className="cursor-pointer font-medium">Session 資訊（開發用）</summary>
          <pre className="mt-2 overflow-x-auto">{JSON.stringify(user, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <span className="ml-1 text-sm font-normal text-gray-400">{unit}</span>}
      </p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      {label}
    </a>
  );
}
