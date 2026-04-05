import { getCurrentUser } from "@/lib/session";
import { getMonthBookingSummary } from "@/server/queries/booking";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { CalendarMonth } from "./bookings/calendar-month";

async function getDashboardStats(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return null;

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const todayEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

  if (user.role === "OWNER") {
    const [customerCount, activeCount, todayBookings, monthRevenue] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { customerStage: "ACTIVE" } }),
      prisma.booking.count({
        where: {
          bookingDate: { gte: todayStart, lte: todayEnd },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: monthStart },
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
          bookingDate: { gte: todayStart, lte: todayEnd },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
    ]);
    return { customerCount, activeCount, todayBookings, monthRevenue: null };
  }

  return null;
}

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const stats = await getDashboardStats(user);
  const isOwner = user?.role === "OWNER";

  const today = new Date();
  const year = params.year ? parseInt(params.year) : today.getFullYear();
  const month = params.month ? parseInt(params.month) : today.getMonth() + 1;
  const monthData = await getMonthBookingSummary(year, month);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-4">
      {/* Greeting + KPI */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-earth-900">
          歡迎回來，{user?.name}
        </h2>

        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="名下顧客" value={stats.customerCount} unit="位" />
            <StatCard label="有效課程顧客" value={stats.activeCount} unit="位" />
            <StatCard label="今日預約" value={stats.todayBookings} unit="筆" highlight />
            {isOwner && stats.monthRevenue !== null && (
              <StatCard
                label="本月營收"
                value={`$${stats.monthRevenue.toLocaleString()}`}
                unit=""
              />
            )}
          </div>
        )}
      </div>

      {/* Calendar Overview */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-earth-800">預約總覽</h3>
          <Link
            href="/dashboard/bookings"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            預約管理 →
          </Link>
        </div>
        <div className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
          <CalendarMonth
            year={year}
            month={month}
            monthData={monthData}
            basePath="/dashboard/bookings"
          />
        </div>
      </section>

      {/* Quick Links */}
      <section className="rounded-xl border border-earth-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-earth-700">快速入口</h3>
        <div className="flex flex-wrap gap-2">
          <QuickLink href="/dashboard/customers" label="顧客管理" />
          <QuickLink href="/dashboard/bookings/new" label="新增預約" />
          <QuickLink href="/dashboard/plans" label="課程方案" />
          <QuickLink href="/dashboard/transactions" label="交易紀錄" />
          <QuickLink href="/dashboard/cashbook" label="現金帳" />
          {isOwner && <QuickLink href="/dashboard/staff" label="店長管理" />}
          <QuickLink href="/dashboard/reports" label="報表" />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number | string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        highlight
          ? "border-primary-200 bg-primary-50"
          : "border-earth-200 bg-white"
      }`}
    >
      <p className={`text-xs ${highlight ? "text-primary-600" : "text-earth-500"}`}>{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? "text-primary-700" : "text-earth-900"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <span className="ml-1 text-sm font-normal text-earth-400">{unit}</span>}
      </p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-earth-200 bg-white px-3.5 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50 hover:border-earth-300 transition-colors"
    >
      {label}
    </Link>
  );
}
