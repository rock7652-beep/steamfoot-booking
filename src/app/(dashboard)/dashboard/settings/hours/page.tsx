import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { getBusinessHours, getMonthSpecialDays } from "@/server/actions/business-hours";
import { toLocalDateStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { ScheduleManager } from "./schedule-manager";

export default async function ScheduleSettingsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "business_hours.view"))) notFound();

  const canManage = await checkPermission(user.role, user.staffId, "business_hours.manage");

  // ADMIN 須先選擇特定店才能進入店舖設定
  const { getActiveStoreForRead } = await import("@/lib/store");
  const effectiveStoreId = user.role === "ADMIN"
    ? await getActiveStoreForRead(user)
    : user.storeId;
  if (!effectiveStoreId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-earth-500 hover:text-earth-700">← 首頁</Link>
        </div>
        <div className="py-12 text-center">
          <p className="text-sm text-earth-500">請先從右上角切換到特定店舖，才能管理預約開放設定。</p>
        </div>
      </div>
    );
  }

  // 取得初始資料（使用台灣時間判斷當前月份）
  const todayStr = toLocalDateStr();
  const [nowYear, nowMonth] = todayStr.split("-").map(Number);
  const [weeklyHours, specialDays, currentStore] = await Promise.all([
    getBusinessHours(),
    getMonthSpecialDays(nowYear, nowMonth),
    prisma.store.findUnique({ where: { id: effectiveStoreId }, select: { isDefault: true } }),
  ]);
  const isHeadquarters = currentStore?.isDefault ?? false;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-earth-500 hover:text-earth-700">← 首頁</Link>
        <h1 className="text-lg font-bold text-earth-900">預約開放設定</h1>
      </div>
      <p className="text-xs text-earth-400">管理每日可預約時段，設定店休、進修日或特殊營業時間</p>

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
    </div>
  );
}
