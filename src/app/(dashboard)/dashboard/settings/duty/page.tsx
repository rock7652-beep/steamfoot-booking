import { getCurrentUser } from "@/lib/session";
import { getShopConfig } from "@/lib/shop-config";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  PageShell,
  PageHeader,
  InfoList,
  type InfoListItem,
} from "@/components/desktop";
import { DutySchedulingToggle } from "./duty-toggle";

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
    specialDays.map((s) => [s.date.toISOString().slice(0, 10), s.type])
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
  const scheduledSet = new Set(dutyDates.map((d) => d.date.toISOString().slice(0, 10)));

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
  const storeId = user.role === "ADMIN"
    ? await getActiveStoreForRead(user)
    : user.storeId;
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
          <p className="text-sm text-earth-500">請先從右上角切換到特定店舖，才能管理值班排班設定。</p>
        </div>
      </PageShell>
    );
  }
  const config = await getShopConfig();
  const weekInfo = await getUnscheduledDaysThisWeek(storeId);

  const summary: InfoListItem[] = [
    {
      label: "聯動狀態",
      value: config.dutySchedulingEnabled ? (
        <span className="text-primary-700">已啟用</span>
      ) : (
        <span className="text-earth-500">停用中</span>
      ),
    },
    {
      label: "本週營業日",
      value: `${weekInfo.total} 天`,
    },
    {
      label: "本週已排班",
      value:
        weekInfo.total === 0
          ? "—"
          : `${weekInfo.total - weekInfo.unscheduled} / ${weekInfo.total} 天`,
    },
  ];

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

      <section className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-earth-900">目前狀態</h2>
        <InfoList items={summary} />
      </section>

      <DutySchedulingToggle
        enabled={config.dutySchedulingEnabled}
        unscheduledDays={weekInfo.unscheduled}
        totalBusinessDays={weekInfo.total}
        unscheduledDates={weekInfo.unscheduledDates}
      />
    </PageShell>
  );
}
