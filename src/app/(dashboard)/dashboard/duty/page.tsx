import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { redirect } from "next/navigation";
import { getDutyByWeek, getDutyByDateRange } from "@/server/queries/duty";
import { getActiveStoreForRead } from "@/lib/store";
import {
  getCachedSpecialDays,
  getBusinessHoursWithTiming,
  getSpecialDaysWithTiming,
  getDutyEnabledWithTiming,
} from "@/lib/duty-cache";
import { ServerTiming, withTiming } from "@/lib/perf";
import { DutyWeekView } from "./duty-week-view";
import type { UserRole } from "@prisma/client";

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function DutyWeekSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 flex items-center gap-2">
        <div className="h-6 w-28 rounded-full bg-earth-200" />
      </div>
      <div className="mb-4 flex items-center justify-between">
        <div className="h-6 w-24 rounded bg-earth-200" />
      </div>
      <div className="mb-4 flex items-center justify-center gap-3">
        <div className="h-8 w-16 rounded bg-earth-200" />
        <div className="h-5 w-28 rounded bg-earth-200" />
        <div className="h-8 w-16 rounded bg-earth-200" />
      </div>
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
        <div className="border-b border-earth-200 bg-earth-50 p-3">
          <div className="flex gap-2">
            <div className="h-4 w-12 rounded bg-earth-200" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-8 flex-1 rounded bg-earth-200" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-2 border-b border-earth-100 p-3">
            <div className="h-4 w-12 rounded bg-earth-100" />
            {Array.from({ length: 7 }).map((_, j) => (
              <div key={j} className="h-6 flex-1 rounded bg-earth-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

async function DutyWeekContent({ weekStart, userRole, userStaffId, activeStoreId }: {
  weekStart: string;
  userRole: UserRole;
  userStaffId: string | null;
  activeStoreId: string | null;
}) {
  const timer = new ServerTiming("/dashboard/duty");

  const weekStartDate = new Date(weekStart + "T00:00:00Z");
  const weekEndISO = new Date(weekStartDate.getTime() + 6 * 86400000).toISOString();
  const prevWeekStart = addDays(weekStart, -7);
  const nextWeekStart = addDays(weekStart, 7);
  const prevWeekEnd = new Date(new Date(prevWeekStart + "T00:00:00Z").getTime() + 6 * 86400000).toISOString();
  const nextWeekEnd = new Date(new Date(nextWeekStart + "T00:00:00Z").getTime() + 6 * 86400000).toISOString();

  // ── 2 個核心查詢 + 3 個快取查詢，全部並行 ──
  const [
    assignments,
    businessHours,
    specialDays,
    dutyEnabled,
    canManage,
    _prevAssignments,
    _nextAssignments,
    _prevSpecialDays,
    _nextSpecialDays,
  ] = await Promise.all([
    withTiming("getDutyByWeek", timer, () => getDutyByWeek(weekStart, activeStoreId)),
    getBusinessHoursWithTiming(timer),
    getSpecialDaysWithTiming(weekStartDate.toISOString(), weekEndISO, timer),
    getDutyEnabledWithTiming(timer),
    userRole === "ADMIN"
      ? Promise.resolve(true)
      : checkPermission(userRole, userStaffId, "duty.manage"),
    getDutyByDateRange(prevWeekStart, 6, undefined, activeStoreId).catch(() => []),
    getDutyByDateRange(nextWeekStart, 6, undefined, activeStoreId).catch(() => []),
    getCachedSpecialDays(new Date(prevWeekStart + "T00:00:00Z").toISOString(), prevWeekEnd).catch(() => []),
    getCachedSpecialDays(new Date(nextWeekStart + "T00:00:00Z").toISOString(), nextWeekEnd).catch(() => []),
  ]);

  const perfLog = timer.finish();

  return (
    <>
      {/* 值班排班聯動狀態提示 */}
      <div className="mb-4 flex items-center gap-2">
        {dutyEnabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            排班聯動已啟用
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-earth-100 px-3 py-1 text-xs font-medium text-earth-500">
            <span className="h-1.5 w-1.5 rounded-full bg-earth-400" />
            排班聯動未啟用（值班僅供參考）
          </span>
        )}
        {userRole === "ADMIN" && (
          <a
            href="/dashboard/settings/duty"
            className="text-xs text-primary-600 hover:text-primary-800 hover:underline"
          >
            設定
          </a>
        )}
        {/* Server timing（開發模式可見） */}
        {process.env.NODE_ENV === "development" && (
          <span className="ml-auto text-[10px] text-earth-400">
            server: {perfLog.totalMs}ms | queries: {perfLog.queryCount}
          </span>
        )}
      </div>
      <DutyWeekView
        weekStart={weekStart}
        assignments={assignments}
        businessHours={businessHours}
        specialDays={specialDays}
        canManage={canManage}
      />
    </>
  );
}

export default async function DutyPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "duty.read"))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const todayStr = toLocalDateStr();
  const weekStart = params.week ?? getMonday(todayStr);
  const activeStoreId = await getActiveStoreForRead(user);

  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={<DutyWeekSkeleton />}>
        <DutyWeekContent
          weekStart={weekStart}
          userRole={user.role}
          userStaffId={user.staffId}
          activeStoreId={activeStoreId}
        />
      </Suspense>
    </div>
  );
}
