import { getCurrentUser } from "@/lib/session";
import { getShopConfig } from "@/lib/shop-config";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { DutySchedulingToggle } from "./duty-toggle";

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  const dateObj = new Date(dateStr + "T00:00:00Z");
  const dow = dateObj.getUTCDay();
  return `${parseInt(m)}/${parseInt(d)}(${DAY_LABELS[dow]})`;
}

/** 取得本週（週一～週日）未排班營業日數量 */
async function getUnscheduledDaysThisWeek(storeId: string): Promise<{
  total: number;
  unscheduled: number;
  unscheduledDates: string[];
}> {
  const todayStr = toLocalDateStr();
  const today = new Date(todayStr + "T00:00:00Z");
  const dow = today.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }

  const [businessHours, specialDays] = await Promise.all([
    prisma.businessHours.findMany({ where: { storeId } }),
    prisma.specialBusinessDay.findMany({
      where: {
        storeId,
        date: {
          gte: new Date(weekDates[0] + "T00:00:00Z"),
          lte: new Date(weekDates[6] + "T23:59:59Z"),
        },
      },
    }),
  ]);

  const bhMap = new Map(businessHours.map((b) => [b.dayOfWeek, b.isOpen]));
  const specialMap = new Map(
    specialDays.map((s) => [s.date.toISOString().slice(0, 10), s.type]),
  );

  const businessDates = weekDates.filter((dateStr) => {
    const specialType = specialMap.get(dateStr);
    if (specialType === "closed") return false;
    if (specialType === "special_open") return true;
    const d = new Date(dateStr + "T00:00:00Z");
    return bhMap.get(d.getUTCDay()) ?? false;
  });

  const dutyDates = await prisma.dutyAssignment.findMany({
    where: {
      storeId,
      date: {
        in: businessDates.map((d) => new Date(d + "T00:00:00Z")),
      },
    },
    select: { date: true },
    distinct: ["date"],
  });
  const scheduledSet = new Set(
    dutyDates.map((d) => d.date.toISOString().slice(0, 10)),
  );

  const unscheduledDates = businessDates.filter((d) => !scheduledSet.has(d));

  return {
    total: businessDates.length,
    unscheduled: unscheduledDates.length,
    unscheduledDates,
  };
}

export default async function DutySettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/hq/login");
  }
  if (user.role !== "ADMIN" && user.role !== "OWNER" && user.role !== "PARTNER") {
    notFound();
  }

  const { getActiveStoreForRead } = await import("@/lib/store");
  const storeId = user.role === "ADMIN" ? await getActiveStoreForRead(user) : user.storeId;
  if (!storeId) {
    return (
      <PageShell>
        <PageHeader
          title="值班排班設定"
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
          <p className="text-sm text-earth-500">
            請先從右上角切換到特定店舖，才能管理值班排班設定。
          </p>
        </div>
      </PageShell>
    );
  }
  const config = await getShopConfig();
  const weekInfo = await getUnscheduledDaysThisWeek(storeId);
  const enabled = config.dutySchedulingEnabled;
  const scheduledDays = weekInfo.total - weekInfo.unscheduled;

  return (
    <PageShell>
      <PageHeader
        title="值班排班設定"
        subtitle="控制值班排班是否與預約系統聯動"
        actions={
          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回設定
          </Link>
        }
      />

      {/* Status row */}
      <section className="rounded-xl border border-earth-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-earth-500">聯動狀態</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  enabled
                    ? "bg-primary-50 text-primary-700"
                    : "bg-earth-100 text-earth-500"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    enabled ? "bg-primary-500" : "bg-earth-400"
                  }`}
                />
                {enabled ? "已啟用" : "未啟用"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-earth-500">本週營業日</span>
              <span className="text-[15px] font-bold tabular-nums text-earth-900">
                {weekInfo.total}
                <span className="ml-0.5 text-[11px] font-normal text-earth-500">
                  天
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-earth-500">本週已排班</span>
              <span className="text-[15px] font-bold tabular-nums text-earth-900">
                {weekInfo.total === 0
                  ? "—"
                  : `${scheduledDays} / ${weekInfo.total}`}
              </span>
            </div>
            {enabled && weekInfo.unscheduled > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-earth-500">缺班</span>
                <span className="text-[15px] font-bold tabular-nums text-amber-700">
                  {weekInfo.unscheduled}
                  <span className="ml-0.5 text-[11px] font-normal text-amber-600">
                    天
                  </span>
                </span>
              </div>
            )}
          </div>

          <DutySchedulingToggle enabled={enabled} compact />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: explanations */}
        <section className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-earth-900">功能說明</h2>
          <p className="mt-1 text-[11px] text-earth-500">
            開啟後，僅安排值班人員的時段才會出現在顧客預約頁
          </p>

          <ul className="mt-4 space-y-3 text-[13px] leading-relaxed text-earth-700">
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
              <span>
                <span className="font-medium text-earth-800">關閉狀態：</span>
                所有營業時段均可接受預約，值班排班僅供內部參考
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
              <span>
                <span className="font-medium text-earth-800">開啟狀態：</span>
                只有安排了值班人員的時段才會出現在預約頁面
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>
                <span className="font-medium text-earth-800">OWNER 例外：</span>
                後台代客預約時可勾選「略過值班檢查」繞過此限制
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-earth-300" />
              <span>可隨時關閉，關閉後所有營業時段立即恢復正常</span>
            </li>
          </ul>
        </section>

        {/* Right: week overview + actions */}
        <section className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-earth-900">
                本週值班概覽
              </h2>
              <p className="mt-0.5 text-[11px] text-earth-500">
                依本週週一～週日營業日計算
              </p>
            </div>
            <Link
              href="/dashboard/duty"
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              前往排班 →
            </Link>
          </header>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-earth-100 bg-earth-50/40 p-3">
              <div className="text-[11px] text-earth-500">已排班</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-primary-700">
                {scheduledDays}
                <span className="ml-1 text-[11px] font-normal text-earth-500">
                  / {weekInfo.total}
                </span>
              </div>
            </div>
            <div
              className={`rounded-lg border p-3 ${
                weekInfo.unscheduled > 0
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-earth-100 bg-earth-50/40"
              }`}
            >
              <div className="text-[11px] text-earth-500">未排班</div>
              <div
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  weekInfo.unscheduled > 0 ? "text-amber-700" : "text-earth-700"
                }`}
              >
                {weekInfo.unscheduled}
                <span className="ml-1 text-[11px] font-normal text-earth-500">
                  天
                </span>
              </div>
            </div>
          </div>

          {enabled && weekInfo.unscheduled > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[13px] font-medium text-amber-800">
                ⚠ 本週有 {weekInfo.unscheduled} 個營業日尚未安排值班
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                未排班日期：{weekInfo.unscheduledDates.map(formatDateShort).join("、")}
              </p>
              <p className="mt-1 text-[11px] text-amber-600">
                這些日期的所有時段目前對客戶不可見
              </p>
            </div>
          )}

          {!enabled && (
            <p className="mt-4 rounded-lg bg-earth-50 p-3 text-[11px] leading-relaxed text-earth-500">
              聯動目前停用中，所有營業時段均可預約。即使有未排班日期也不會影響顧客預約。
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
