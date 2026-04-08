import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getBusinessHours, getSpecialDays } from "@/server/actions/business-hours";
import { BusinessHoursForm } from "./business-hours-form";
import { SpecialDaysForm } from "./special-days-form";
import Link from "next/link";

export default async function BusinessHoursPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "OWNER") redirect("/dashboard");

  const [hours, specialDays] = await Promise.all([
    getBusinessHours(),
    getSpecialDays(),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings" className="text-sm text-earth-500 hover:text-earth-700">
          &larr; 設定
        </Link>
        <h1 className="text-xl font-bold text-earth-900">營業時間設定</h1>
      </div>

      {/* 每週固定營業時間 */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-earth-800">每週固定營業時間</h2>
        <BusinessHoursForm
          hours={hours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            dayName: h.dayName,
            isOpen: h.isOpen,
            openTime: h.openTime,
            closeTime: h.closeTime,
          }))}
        />
      </div>

      {/* 特殊日期 */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-earth-800">特殊日期設定</h2>
        <p className="mb-3 text-xs text-earth-400">
          設定公休、進修日或特殊營業時段，將覆蓋該日的固定營業時間
        </p>
        <SpecialDaysForm
          specialDays={specialDays.map((d) => ({
            id: d.id,
            date: d.date.toISOString().slice(0, 10),
            type: d.type as "closed" | "training" | "custom",
            reason: d.reason,
            openTime: d.openTime,
            closeTime: d.closeTime,
          }))}
        />
      </div>
    </div>
  );
}
