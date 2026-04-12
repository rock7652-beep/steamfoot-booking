import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getDutyByDate } from "@/server/queries/duty";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreFilter } from "@/lib/manager-visibility";
import { prisma } from "@/lib/db";
import { generateSlots } from "@/lib/slot-generator";
import { DutyDayEditor } from "./duty-day-editor";

interface PageProps {
  params: Promise<{ date: string }>;
}

export default async function DutyDayPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "duty.read"))) {
    redirect("/dashboard");
  }

  const { date } = await params;
  const canManage = user.role === "ADMIN" || await checkPermission(user.role, user.staffId, "duty.manage");
  const activeStoreId = await getActiveStoreForRead(user);
  const storeFilter = getStoreFilter(user, activeStoreId);

  // 取值班資料
  const assignments = await getDutyByDate(date, activeStoreId);

  // 取該日營業時段
  const dateObj = new Date(date + "T00:00:00Z");
  const dow = dateObj.getUTCDay();

  const [specialDay, businessHour, slotOverrides] = await Promise.all([
    prisma.specialBusinessDay.findUnique({ where: { date: dateObj } }),
    prisma.businessHours.findUnique({ where: { dayOfWeek: dow } }),
    prisma.slotOverride.findMany({ where: { date: dateObj } }),
  ]);

  let isClosed = false;
  let closedReason = "";
  let slots: string[] = [];

  if (specialDay && (specialDay.type === "closed" || specialDay.type === "training")) {
    isClosed = true;
    closedReason = specialDay.reason ?? (specialDay.type === "training" ? "進修日" : "公休");
  } else if (!specialDay && businessHour && !businessHour.isOpen) {
    isClosed = true;
    closedReason = "固定公休";
  } else {
    const openTime = specialDay?.type === "custom" ? specialDay.openTime : (businessHour?.openTime ?? null);
    const closeTime = specialDay?.type === "custom" ? specialDay.closeTime : (businessHour?.closeTime ?? null);
    const interval = (specialDay?.type === "custom" ? specialDay.slotInterval : null) ?? businessHour?.slotInterval ?? 60;
    const capacity = (specialDay?.type === "custom" ? specialDay.defaultCapacity : null) ?? businessHour?.defaultCapacity ?? 6;

    if (openTime && closeTime) {
      const generated = generateSlots(openTime, closeTime, interval, capacity);
      slots = generated.map((s) => s.startTime);

      // 處理覆寫
      const slotSet = new Set(slots);
      const overrideMap = new Map(slotOverrides.map((o) => [o.startTime, o]));
      for (const [startTime, override] of overrideMap) {
        if (override.type === "enabled" && !slotSet.has(startTime)) {
          slots.push(startTime);
        }
      }
      const disabledSet = new Set(
        slotOverrides.filter((o) => o.type === "disabled").map((o) => o.startTime)
      );
      slots = slots.filter((s) => !disabledSet.has(s)).sort();
    } else {
      isClosed = true;
      closedReason = "尚未設定營業時間";
    }
  }

  // 取所有 ACTIVE staff + 週範圍資料（合併查詢減少 round-trip）
  const d = new Date(date + "T00:00:00Z");
  const dayOfWeekIdx = d.getUTCDay();
  const mondayOffset = dayOfWeekIdx === 0 ? -6 : 1 - dayOfWeekIdx;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const wd = new Date(monday);
    wd.setUTCDate(wd.getUTCDate() + i);
    weekDates.push(wd.toISOString().slice(0, 10));
  }

  const [staffList, weekAssignmentCounts, allBusinessHours, weekSpecialDays] = await Promise.all([
    prisma.staff.findMany({
      where: { status: "ACTIVE", ...storeFilter },
      select: {
        id: true,
        displayName: true,
        colorCode: true,
        user: { select: { role: true } },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.dutyAssignment.groupBy({
      by: ["date"],
      where: {
        ...storeFilter,
        date: {
          gte: new Date(weekDates[0] + "T00:00:00Z"),
          lte: new Date(weekDates[6] + "T00:00:00Z"),
        },
      },
      _count: { id: true },
    }),
    prisma.businessHours.findMany(),
    prisma.specialBusinessDay.findMany({
      where: {
        date: {
          gte: new Date(weekDates[0] + "T00:00:00Z"),
          lte: new Date(weekDates[6] + "T00:00:00Z"),
        },
      },
    }),
  ]);

  const weekCountMap = new Map(
    weekAssignmentCounts.map((c) => [c.date.toISOString().slice(0, 10), c._count.id])
  );

  const specialDayMap = new Map(weekSpecialDays.map((s) => [s.date.toISOString().slice(0, 10), s]));
  const bhMap = new Map(allBusinessHours.map((b) => [b.dayOfWeek, b]));

  const weekDayInfo = weekDates.map((wd) => {
    const wdObj = new Date(wd + "T00:00:00Z");
    const wdDow = wdObj.getUTCDay();
    const sp = specialDayMap.get(wd);
    const bh = bhMap.get(wdDow);

    let isBusinessDay = true;
    if (sp && (sp.type === "closed" || sp.type === "training")) {
      isBusinessDay = false;
    } else if (!sp && bh && !bh.isOpen) {
      isBusinessDay = false;
    } else if (!sp && !bh) {
      isBusinessDay = false;
    }

    return {
      date: wd,
      isBusinessDay,
      existingCount: weekCountMap.get(wd) ?? 0,
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <DutyDayEditor
        date={date}
        isClosed={isClosed}
        closedReason={closedReason}
        slots={slots}
        assignments={assignments.map((a) => ({
          id: a.id,
          slotTime: a.slotTime,
          staffId: a.staffId,
          staffName: a.staff.displayName,
          staffColor: a.staff.colorCode,
          dutyRole: a.dutyRole,
          participationType: a.participationType,
          notes: a.notes,
        }))}
        staffList={staffList.map((s) => ({
          id: s.id,
          displayName: s.displayName,
          colorCode: s.colorCode,
          userRole: s.user.role,
        }))}
        canManage={canManage}
        weekDayInfo={weekDayInfo}
      />
    </div>
  );
}
