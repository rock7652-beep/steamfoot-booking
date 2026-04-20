import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { getBusinessHours, getMonthSpecialDays } from "@/server/actions/business-hours";
import { toLocalDateStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  PageShell,
  PageHeader,
  InfoList,
  type InfoListItem,
} from "@/components/desktop";
import { ScheduleManager } from "./schedule-manager";

export default async function ScheduleSettingsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "business_hours.view"))) notFound();

  const canManage = await checkPermission(user.role, user.staffId, "business_hours.manage");

  const { getActiveStoreForRead } = await import("@/lib/store");
  const effectiveStoreId = user.role === "ADMIN"
    ? await getActiveStoreForRead(user)
    : user.storeId;
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
  const [weeklyHours, specialDays, currentStore] = await Promise.all([
    getBusinessHours(),
    getMonthSpecialDays(nowYear, nowMonth),
    prisma.store.findUnique({ where: { id: effectiveStoreId }, select: { isDefault: true } }),
  ]);
  const isHeadquarters = currentStore?.isDefault ?? false;

  // Summary 資料
  const openDays = weeklyHours.filter((h) => h.isOpen);
  const sampleOpen = openDays[0];
  const hoursRange = sampleOpen
    ? `${sampleOpen.openTime}–${sampleOpen.closeTime}`
    : "尚未設定";
  const summary: InfoListItem[] = [
    { label: "營業時間", value: hoursRange },
    { label: "營業天數", value: `${openDays.length} 天 / 週` },
    {
      label: "本月特殊日",
      value:
        specialDays.length === 0
          ? "無"
          : `${specialDays.length} 筆（休假／特殊營業）`,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="預約開放設定"
        subtitle="管理每日可預約時段，設定店休、進修日或特殊營業時間"
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

      <ScheduleManager
        weeklyHours={weeklyHours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          dayName: h.dayName,
          isOpen: h.isOpen,
          openTime: h.openTime,
          closeTime: h.closeTime,
          slotInterval: h.slotInterval,
          defaultCapacity: h.defaultCapacity,
        }))}
        initialSpecialDays={specialDays}
        initialYear={nowYear}
        initialMonth={nowMonth}
        canManage={canManage}
        isHeadquarters={isHeadquarters}
      />
    </PageShell>
  );
}
