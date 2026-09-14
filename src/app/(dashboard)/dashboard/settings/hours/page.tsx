import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { getMonthSpecialDays } from "@/server/actions/business-hours";
import {
  getCachedBusinessHours,
  getCachedMonthScheduleSummary,
} from "@/lib/query-cache";
import { parseBusinessPeriods } from "@/lib/business-hours-resolver";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { toLocalDateStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { ScheduleManager } from "./schedule-manager";
import { BookableUntilForm } from "./bookable-until-form";

const WEEK_DAY_NAMES = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

export default async function ScheduleSettingsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "business_hours.view"))) notFound();

  const canManage = await checkPermission(user.role, user.staffId, "business_hours.manage");

  const { getActiveStoreForRead } = await import("@/lib/store");
  const effectiveStoreId = await getActiveStoreForRead(user);
  if (!effectiveStoreId) {
    return (
      <PageShell>
        <PageHeader
          title="預約開放設定"
          actions={
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              ← 返回設定
            </Link>
          }
        />
        <div className="rounded-xl border border-earth-200 bg-white p-8 text-center">
          <p className="text-sm text-earth-500">請先從右上角切換到特定店舖，才能管理預約開放設定。</p>
        </div>
      </PageShell>
    );
  }

  const todayStr = toLocalDateStr();
  const [nowYear, nowMonth] = todayStr.split("-").map(Number);
  // 全部走 unstable_cache（60s TTL + tag: business-hours / special-days）。
  // 第一個進來的人付出 DB 成本，60s 內後續所有人秒開；
  // 任一 mutation 都會打對應 tag 失效，看到的不會是 stale 資料。
  // weeklyHours 缺 dayName 一欄，下方手動補。
  // initialSummary 直接從 server cache 拿，傳給 client manager 當啟動值，
  // 避免 client mount 後再打一次 server 補抓 summary。
  const [weeklyRows, specialDays, currentStore, initialSummary, shopConfig] = await Promise.all([
    getCachedBusinessHours(effectiveStoreId),
    getMonthSpecialDays(nowYear, nowMonth),
    prisma.store.findUnique({ where: { id: effectiveStoreId }, select: { isDefault: true } }),
    getCachedMonthScheduleSummary(effectiveStoreId, nowYear, nowMonth),
    prisma.shopConfig.findUnique({
      where: { storeId: effectiveStoreId },
      select: { bookableUntilDate: true, bookingOpensAt: true, bookingWindowDays: true },
    }),
  ]);
  const bookableUntilInitial = shopConfig?.bookableUntilDate
    ? shopConfig.bookableUntilDate.toISOString().slice(0, 10)
    : null;
  const weeklyHours = weeklyRows.map((h) => ({
    ...h,
    dayName: WEEK_DAY_NAMES[h.dayOfWeek],
  }));
  const isHeadquarters = currentStore?.isDefault ?? false;
  const isSpaStore =
    (await getStoreIndustryModule(effectiveStoreId)) === "spa";

  return (
    <PageShell>
      <PageHeader
        title={isSpaStore ? "營業與預約時間" : "服務時間與預約開放"}
        subtitle={isSpaStore ? "設定每週營業時間、15／30 分鐘預約單位及特殊休假" : "管理當日服務時間、預約時段間隔與每時段可接人數"}
        actions={
          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回設定
          </Link>
        }
      />

      {/* 顧客可預約到日期 */}
      <BookableUntilForm
        key={`bookable-until-${effectiveStoreId}`}
        initialDate={bookableUntilInitial}
        initialDays={shopConfig?.bookingWindowDays ?? 14}
        today={todayStr}
        canManage={canManage}
      />

      <ScheduleManager
            key={`schedule-${effectiveStoreId}`}
            weeklyHours={weeklyHours.map((h) => ({
              dayOfWeek: h.dayOfWeek,
              dayName: h.dayName,
              isOpen: h.isOpen,
              openTime: h.openTime,
              closeTime: h.closeTime,
              slotInterval: h.slotInterval,
              defaultCapacity: h.defaultCapacity,
              periods: parseBusinessPeriods(h.segments, h),
            }))}
            initialSpecialDays={specialDays}
            initialSummary={initialSummary}
            initialYear={nowYear}
            initialMonth={nowMonth}
            canManage={canManage}
            isHeadquarters={isHeadquarters}
            isSpaStore={isSpaStore}
          />
    </PageShell>
  );
}
