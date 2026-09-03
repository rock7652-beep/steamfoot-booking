import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { getMonthSpecialDays } from "@/server/actions/business-hours";
import {
  getCachedBusinessHours,
  getCachedMonthScheduleSummary,
} from "@/lib/query-cache";
import { parseBusinessPeriods } from "@/lib/business-hours-resolver";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { toLocalDateStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { ScheduleManager } from "./schedule-manager";
import { BookableUntilForm } from "./bookable-until-form";

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const WEEK_DAY_NAMES = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
const SPECIAL_TYPE_LABEL: Record<string, string> = {
  closed: "公休",
  training: "進修",
  special_open: "特殊營業",
  custom: "自訂",
};
const SPECIAL_TYPE_COLOR: Record<string, string> = {
  closed: "bg-earth-100 text-earth-600",
  training: "bg-red-100 text-red-700",
  special_open: "bg-blue-100 text-blue-700",
  custom: "bg-amber-100 text-amber-700",
};

function formatSpecialDayLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return `${parseInt(m)}/${parseInt(d)}（${DAY_LABELS[dow]}）`;
}

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
  const isSpaDemo =
    (await getStoreIndustryModule(effectiveStoreId)) === "spa" &&
    effectiveStoreId === SPA_DEMO_STORE.id;

  const openDays = weeklyHours.filter((h) => h.isOpen);
  const sampleOpen = openDays[0];
  const hoursRange = sampleOpen
    ? `${sampleOpen.openTime}–${sampleOpen.closeTime}`
    : "尚未設定";

  const closedSpecialDays = specialDays.filter((s) => s.type === "closed").length;
  const trainingDays = specialDays.filter((s) => s.type === "training").length;
  const customDays = specialDays.length - closedSpecialDays - trainingDays;

  return (
    <PageShell>
      <PageHeader
        title={isSpaDemo ? "營業與預約時間" : "預約開放設定"}
        subtitle={isSpaDemo ? "設定每週營業時間、15／30 分鐘預約單位及特殊休假" : "管理每日可預約時段，設定店休、進修日或特殊營業時間"}
        actions={
          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回設定
          </Link>
        }
      />

      {/* Compact summary row */}
      <section className="rounded-xl border border-earth-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-earth-500">營業時間</span>
            <span className="text-[15px] font-bold tabular-nums text-earth-900">
              {hoursRange}
            </span>
          </div>
          <span className="text-earth-200">｜</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-earth-500">營業天數</span>
            <span className="text-[15px] font-bold tabular-nums text-earth-900">
              {openDays.length}
              <span className="ml-0.5 text-[11px] font-normal text-earth-500">
                天 / 週
              </span>
            </span>
          </div>
          <span className="text-earth-200">｜</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-earth-500">本月特殊日</span>
            <span className="text-[15px] font-bold tabular-nums text-earth-900">
              {specialDays.length}
              <span className="ml-0.5 text-[11px] font-normal text-earth-500">
                筆
              </span>
            </span>
          </div>
          {specialDays.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              {closedSpecialDays > 0 && (
                <span className="rounded bg-earth-100 px-1.5 py-0.5 text-earth-600">
                  公休 {closedSpecialDays}
                </span>
              )}
              {trainingDays > 0 && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                  進修 {trainingDays}
                </span>
              )}
              {customDays > 0 && (
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                  特殊 {customDays}
                </span>
              )}
            </div>
          )}
          <span className="ml-auto text-[11px] text-earth-400">
            {isHeadquarters ? "總部設定（其他店可同步）" : "本店設定"}
          </span>
        </div>
      </section>

      {/* 顧客可預約到日期 */}
      <BookableUntilForm
        key={`bookable-until-${effectiveStoreId}`}
        initialDate={bookableUntilInitial}
        initialDays={shopConfig?.bookingWindowDays ?? 14}
        today={todayStr}
        canManage={canManage}
      />

      {/* Calendar + rules panel */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
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
          />
        </div>

        {/* Right rules panel */}
        <aside className="space-y-3 xl:col-span-4 xl:sticky xl:top-4 xl:self-start">
          {/* Weekly fixed rule summary */}
          <section className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
            <header className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-earth-900">
                平常營業時間
              </h3>
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                ✓ 設定一次循環
              </span>
            </header>
            <p className="mt-1 text-[11px] leading-relaxed text-earth-500">
              只有長期營業時間改變才需要調整；臨時訓練、旅遊或休息，直接點月曆日期。
            </p>

            <div className="mt-3 space-y-1">
              {weeklyHours.map((h) => (
                <div
                  key={h.dayOfWeek}
                  className="flex items-center justify-between rounded-md border border-earth-100 bg-earth-50/40 px-2.5 py-1.5 text-[12px]"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-medium text-earth-700">
                      {h.dayName}
                    </span>
                    <span
                      className={
                        h.isOpen ? "text-earth-700" : "text-earth-400"
                      }
                    >
                      {h.isOpen ? `${h.openTime}–${h.closeTime}` : "公休"}
                    </span>
                  </div>
                  {h.isOpen && (
                    <span className="text-[10px] text-earth-400 tabular-nums">
                      {h.slotInterval}m · {h.defaultCapacity} 位
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Special days list */}
          <section className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
            <header className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-earth-900">
                本月特別安排
              </h3>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                點日期即可調整
              </span>
            </header>
            <p className="mt-1 text-[11px] leading-relaxed text-earth-500">
              適合訓練、旅遊、臨時公休或不同營業時間。
            </p>

            {specialDays.length === 0 ? (
              <p className="mt-3 rounded-md bg-earth-50 px-3 py-3 text-center text-[11px] text-earth-400">
                本月尚無特殊日設定
              </p>
            ) : (
              <ul className="mt-3 space-y-1">
                {specialDays
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-md border border-earth-100 bg-earth-50/40 px-2.5 py-1.5 text-[12px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums text-earth-800">
                          {formatSpecialDayLabel(s.date)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            SPECIAL_TYPE_COLOR[s.type] ??
                            "bg-earth-100 text-earth-600"
                          }`}
                        >
                          {SPECIAL_TYPE_LABEL[s.type] ?? s.type}
                        </span>
                      </div>
                      {s.reason && (
                        <span className="ml-2 truncate text-[10px] text-earth-400">
                          {s.reason}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </PageShell>
  );
}
