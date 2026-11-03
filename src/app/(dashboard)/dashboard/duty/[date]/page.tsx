import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { courseDutyIntervals } from "@/lib/course-duty";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getDutyByDate } from "@/server/queries/duty";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreFilter } from "@/lib/manager-visibility";
import { prisma } from "@/lib/db";
import { applySlotOverrides, resolveDayRule, buildBusinessHoursMap, buildSpecialDayMap } from "@/lib/business-hours-resolver";
import { DutyDayEditor } from "./duty-day-editor";

interface PageProps {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ staff?: string }>;
}

export default async function DutyDayPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "duty.read"))) {
    redirect("/dashboard");
  }

  const { date } = await params;
  const { staff: requestedStaffId } = await searchParams;
  const canManage = user.role === "ADMIN" || await checkPermission(user.role, user.staffId, "duty.manage");
  const activeStoreId = await getActiveStoreForRead(user);
  const storeFilter = getStoreFilter(user, activeStoreId);

  // 取值班資料
  const assignments = await getDutyByDate(date, activeStoreId);

  // 取該日營業時段
  const dateObj = new Date(date + "T00:00:00Z");
  const dow = dateObj.getUTCDay();

  const storeId = activeStoreId ?? user.storeId!;
  const course = await getStoreIndustryModule(storeId) === "course";
  const [specialDay, businessHour, slotOverrides] = await Promise.all([
    prisma.specialBusinessDay.findFirst({ where: { date: dateObj, storeId } }),
    prisma.businessHours.findFirst({ where: { dayOfWeek: dow, storeId } }),
    prisma.slotOverride.findMany({ where: { date: dateObj, storeId } }),
  ]);

  const dayRule = resolveDayRule({dateStr:date,dow,businessHoursMap:buildBusinessHoursMap(businessHour?[businessHour]:[]),specialDayMap:buildSpecialDayMap(specialDay?[specialDay]:[])});
  const slots = course
    ? courseDutyIntervals(date, businessHour ? [businessHour] : [], specialDay ? [specialDay] : []).map(s=>s.slotTime)
    : applySlotOverrides(dayRule,slotOverrides).filter(s=>s.isEnabled).map(s=>s.startTime);
  const isClosed = slots.length === 0;
  const closedReason = dayRule.reason ?? "尚無開放時段";

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

  const [staffList, weekAssignmentCounts, allBusinessHours, weekSpecialDays, weekOverrides] = await Promise.all([
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
    prisma.businessHours.findMany({ where: { storeId } }),
    prisma.specialBusinessDay.findMany({
      where: {
        storeId,
        date: {
          gte: new Date(weekDates[0] + "T00:00:00Z"),
          lte: new Date(weekDates[6] + "T00:00:00Z"),
        },
      },
    }),
    prisma.slotOverride.findMany({where:{storeId,date:{gte:new Date(weekDates[0]+"T00:00:00Z"),lte:new Date(weekDates[6]+"T00:00:00Z")}}}),
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

    const rule=resolveDayRule({dateStr:wd,dow:wdDow,businessHoursMap:bhMap,specialDayMap});
    const isBusinessDay=course
      ? courseDutyIntervals(wd,bh?[bh]:[],sp?[sp]:[]).length>0
      : applySlotOverrides(rule,weekOverrides.filter(o=>o.date.toISOString().slice(0,10)===wd)).some(slot=>slot.isEnabled);

    return {
      date: wd,
      isBusinessDay,
      existingCount: weekCountMap.get(wd) ?? 0,
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <DutyDayEditor
        course={course}
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
        preferredStaffId={staffList.some((staff) => staff.id === requestedStaffId) ? requestedStaffId : undefined}
      />
    </div>
  );
}
