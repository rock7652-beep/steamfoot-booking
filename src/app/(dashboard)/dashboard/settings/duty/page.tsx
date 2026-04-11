import { getCurrentUser } from "@/lib/session";
import { getShopConfig } from "@/lib/shop-config";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { DutySchedulingToggle } from "./duty-toggle";

/** 取得本週（週一～週日）未排班營業日數量 */
async function getUnscheduledDaysThisWeek(): Promise<{
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

  // 查營業時間 + 特殊日
  const [businessHours, specialDays] = await Promise.all([
    prisma.businessHours.findMany(),
    prisma.specialBusinessDay.findMany({
      where: {
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

  // 找出營業日
  const businessDates = weekDates.filter((dateStr) => {
    const specialType = specialMap.get(dateStr);
    if (specialType === "closed") return false;
    if (specialType === "special_open") return true;
    const d = new Date(dateStr + "T00:00:00Z");
    return bhMap.get(d.getUTCDay()) ?? false;
  });

  // 查哪些營業日有排班
  const dutyDates = await prisma.dutyAssignment.findMany({
    where: {
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
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();

  const config = await getShopConfig();
  const weekInfo = await getUnscheduledDaysThisWeek();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-bold text-earth-900">值班排班設定</h1>
        <p className="mt-1 text-sm text-earth-500">
          控制值班排班是否與預約系統聯動
        </p>
      </div>

      <DutySchedulingToggle
        enabled={config.dutySchedulingEnabled}
        unscheduledDays={weekInfo.unscheduled}
        totalBusinessDays={weekInfo.total}
        unscheduledDates={weekInfo.unscheduledDates}
      />
    </div>
  );
}
