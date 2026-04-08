import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { getBusinessHours, getMonthSpecialDays } from "@/server/actions/business-hours";
import Link from "next/link";
import { ScheduleManager } from "./schedule-manager";

export default async function ScheduleSettingsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "business_hours.view"))) notFound();

  const canManage = await checkPermission(user.role, user.staffId, "business_hours.manage");

  // 取得初始資料
  const now = new Date();
  const [weeklyHours, specialDays] = await Promise.all([
    getBusinessHours(),
    getMonthSpecialDays(now.getFullYear(), now.getMonth() + 1),
  ]);

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
        }))}
        initialSpecialDays={specialDays}
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth() + 1}
        canManage={canManage}
      />
    </div>
  );
}
