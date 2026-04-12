"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { handleActionError } from "@/lib/errors";
import {
  dutyAssignmentSchema,
  batchCreateDutySchema,
  copySlotToAllSlotsSchema,
  copyFromPreviousBusinessDaySchema,
  copyToWeekDatesSchema,
} from "@/lib/validators/duty";
import { generateSlots } from "@/lib/slot-generator";
import { revalidateDuty } from "@/lib/revalidation";
import { assertStoreAccess, getStoreFilter } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";
import type { ActionResult } from "@/types";

// ============================================================
// 共用：取得某天的營業時段列表
// ============================================================

async function getBusinessSlotsForDate(dateStr: string): Promise<string[]> {
  const dateObj = new Date(dateStr + "T00:00:00Z");
  const dow = dateObj.getUTCDay();

  const [specialDay, businessHour, slotOverrides] = await Promise.all([
    prisma.specialBusinessDay.findUnique({ where: { date: dateObj } }),
    prisma.businessHours.findUnique({ where: { dayOfWeek: dow } }),
    prisma.slotOverride.findMany({ where: { date: dateObj } }),
  ]);

  // 公休 / 進修
  if (specialDay && (specialDay.type === "closed" || specialDay.type === "training")) {
    return [];
  }
  if (!specialDay && businessHour && !businessHour.isOpen) {
    return [];
  }

  const openTime = specialDay?.type === "custom" ? specialDay.openTime : (businessHour?.openTime ?? null);
  const closeTime = specialDay?.type === "custom" ? specialDay.closeTime : (businessHour?.closeTime ?? null);
  const interval = (specialDay?.type === "custom" ? specialDay.slotInterval : null) ?? businessHour?.slotInterval ?? 60;
  const capacity = (specialDay?.type === "custom" ? specialDay.defaultCapacity : null) ?? businessHour?.defaultCapacity ?? 6;

  if (!openTime || !closeTime) return [];

  const generated = generateSlots(openTime, closeTime, interval, capacity);
  const slots = generated.map((s) => s.startTime);

  // 加入 enabled 覆寫（強制開放的額外時段）
  const overrideMap = new Map(slotOverrides.map((o) => [o.startTime, o]));
  for (const [startTime, override] of overrideMap) {
    if (override.type === "enabled" && !slots.includes(startTime)) {
      slots.push(startTime);
    }
  }

  // 移除 disabled 覆寫
  const disabledSet = new Set(
    slotOverrides.filter((o) => o.type === "disabled").map((o) => o.startTime)
  );
  return slots.filter((s) => !disabledSet.has(s)).sort();
}

// ============================================================
// upsertDutyAssignment
// ============================================================

export async function upsertDutyAssignment(
  input: {
    date: string;
    slotTime: string;
    staffId: string;
    dutyRole: string;
    participationType: string;
    notes?: string;
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission("duty.manage");
    const data = dutyAssignmentSchema.parse(input);

    // 驗證 staff 是 ACTIVE 且同店
    const staff = await prisma.staff.findUnique({ where: { id: data.staffId } });
    if (!staff || staff.status !== "ACTIVE") {
      return { success: false, error: "無法安排非在職人員值班" };
    }
    assertStoreAccess(user, staff.storeId);

    // 驗證是營業日且時段合法
    const validSlots = await getBusinessSlotsForDate(data.date);
    if (validSlots.length === 0) {
      return { success: false, error: "該日為公休日，無法安排值班" };
    }
    if (!validSlots.includes(data.slotTime)) {
      return { success: false, error: `${data.slotTime} 不在該日營業時段內` };
    }

    const dateObj = new Date(data.date + "T00:00:00Z");
    const result = await prisma.dutyAssignment.upsert({
      where: {
        date_slotTime_staffId: {
          date: dateObj,
          slotTime: data.slotTime,
          staffId: data.staffId,
        },
      },
      create: {
        date: dateObj,
        slotTime: data.slotTime,
        staffId: data.staffId,
        dutyRole: data.dutyRole as any,
        participationType: data.participationType as any,
        notes: data.notes,
        createdByStaffId: user.staffId,
        storeId: currentStoreId(user),
      },
      update: {
        dutyRole: data.dutyRole as any,
        participationType: data.participationType as any,
        notes: data.notes,
      },
    });

    revalidateDuty();
    return { success: true, data: { id: result.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// batchCreateDutyAssignments
// ============================================================

export async function batchCreateDutyAssignments(
  input: {
    date: string;
    slotTimes: string[];
    staffId: string;
    dutyRole: string;
    participationType: string;
  }
): Promise<ActionResult> {
  try {
    const user = await requirePermission("duty.manage");
    const data = batchCreateDutySchema.parse(input);

    const staff = await prisma.staff.findUnique({ where: { id: data.staffId } });
    if (!staff || staff.status !== "ACTIVE") {
      return { success: false, error: "無法安排非在職人員值班" };
    }
    assertStoreAccess(user, staff.storeId);

    const validSlots = await getBusinessSlotsForDate(data.date);
    if (validSlots.length === 0) {
      return { success: false, error: "該日為公休日，無法安排值班" };
    }

    const invalidSlots = data.slotTimes.filter((s) => !validSlots.includes(s));
    if (invalidSlots.length > 0) {
      return { success: false, error: `以下時段不在營業範圍內：${invalidSlots.join(", ")}` };
    }

    const dateObj = new Date(data.date + "T00:00:00Z");
    const ops = data.slotTimes.map((slotTime) =>
      prisma.dutyAssignment.upsert({
        where: {
          date_slotTime_staffId: {
            date: dateObj,
            slotTime,
            staffId: data.staffId,
          },
        },
        create: {
          date: dateObj,
          slotTime,
          staffId: data.staffId,
          dutyRole: data.dutyRole as any,
          participationType: data.participationType as any,
          createdByStaffId: user.staffId,
          storeId: currentStoreId(user),
        },
        update: {
          dutyRole: data.dutyRole as any,
          participationType: data.participationType as any,
        },
      })
    );

    await prisma.$transaction(ops);
    revalidateDuty();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// copySlotToAllSlots — 複製到整天（不覆蓋已有安排）
// ============================================================

export async function copySlotToAllSlots(
  input: { date: string; sourceSlotTime: string }
): Promise<ActionResult<{ copiedCount: number }>> {
  try {
    const user = await requirePermission("duty.manage");
    const data = copySlotToAllSlotsSchema.parse(input);

    const dateObj = new Date(data.date + "T00:00:00Z");

    // 取來源時段的安排
    const sourceAssignments = await prisma.dutyAssignment.findMany({
      where: { date: dateObj, slotTime: data.sourceSlotTime },
    });
    if (sourceAssignments.length === 0) {
      return { success: false, error: "來源時段沒有值班安排" };
    }

    // 取該日所有營業時段
    const validSlots = await getBusinessSlotsForDate(data.date);
    const targetSlots = validSlots.filter((s) => s !== data.sourceSlotTime);

    if (targetSlots.length === 0) {
      return { success: false, error: "沒有其他可複製的營業時段" };
    }

    // 取目標時段的已有安排（以 staffId 判斷不覆蓋）
    const existingAssignments = await prisma.dutyAssignment.findMany({
      where: { date: dateObj, slotTime: { in: targetSlots } },
      select: { slotTime: true, staffId: true },
    });
    const existingSet = new Set(
      existingAssignments.map((a) => `${a.slotTime}|${a.staffId}`)
    );

    // 只補入不存在的
    const creates: any[] = [];
    for (const slot of targetSlots) {
      for (const src of sourceAssignments) {
        if (!existingSet.has(`${slot}|${src.staffId}`)) {
          creates.push({
            date: dateObj,
            slotTime: slot,
            staffId: src.staffId,
            dutyRole: src.dutyRole,
            participationType: src.participationType,
            notes: src.notes,
            createdByStaffId: src.createdByStaffId,
            storeId: currentStoreId(user),
          });
        }
      }
    }

    if (creates.length > 0) {
      await prisma.dutyAssignment.createMany({ data: creates, skipDuplicates: true });
    }

    revalidateDuty();
    return { success: true, data: { copiedCount: creates.length } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// copyFromPreviousBusinessDay — 從前一個營業日複製
// ============================================================

export async function copyFromPreviousBusinessDay(
  input: { targetDate: string }
): Promise<ActionResult<{ sourceDate: string; copiedCount: number }>> {
  try {
    const user = await requirePermission("duty.manage");
    const data = copyFromPreviousBusinessDaySchema.parse(input);

    const targetDateObj = new Date(data.targetDate + "T00:00:00Z");

    // 當天必須無安排
    const existingCount = await prisma.dutyAssignment.count({
      where: { date: targetDateObj },
    });
    if (existingCount > 0) {
      return { success: false, error: "今天已有值班安排，請手動調整" };
    }

    // 找前一個營業日（最多往前找 14 天）
    let sourceDate: string | null = null;
    const cursor = new Date(targetDateObj);
    for (let i = 0; i < 14; i++) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      const dateStr = cursor.toISOString().slice(0, 10);
      const slots = await getBusinessSlotsForDate(dateStr);
      if (slots.length > 0) {
        sourceDate = dateStr;
        break;
      }
    }

    if (!sourceDate) {
      return { success: false, error: "找不到前一個營業日（14 天內）" };
    }

    const sourceDateObj = new Date(sourceDate + "T00:00:00Z");
    const sourceAssignments = await prisma.dutyAssignment.findMany({
      where: { date: sourceDateObj },
    });

    if (sourceAssignments.length === 0) {
      return { success: false, error: `前一個營業日（${sourceDate}）沒有值班安排` };
    }

    // 取目標日的營業時段，只複製雙方都存在的
    const targetSlots = new Set(await getBusinessSlotsForDate(data.targetDate));
    const creates = sourceAssignments
      .filter((a) => targetSlots.has(a.slotTime))
      .map((a) => ({
        date: targetDateObj,
        slotTime: a.slotTime,
        staffId: a.staffId,
        dutyRole: a.dutyRole,
        participationType: a.participationType,
        notes: a.notes,
        createdByStaffId: a.createdByStaffId,
        storeId: currentStoreId(user),
      }));

    if (creates.length > 0) {
      await prisma.dutyAssignment.createMany({ data: creates, skipDuplicates: true });
    }

    revalidateDuty();
    return { success: true, data: { sourceDate, copiedCount: creates.length } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// copyToWeekDates — 複製到本週其他日期（覆蓋模式）
// ============================================================

export async function copyToWeekDates(
  input: { sourceDate: string; targetDates: string[] }
): Promise<ActionResult<{ copiedCount: number }>> {
  try {
    const user = await requirePermission("duty.manage");
    const data = copyToWeekDatesSchema.parse(input);

    const sourceDateObj = new Date(data.sourceDate + "T00:00:00Z");
    const sourceAssignments = await prisma.dutyAssignment.findMany({
      where: { date: sourceDateObj },
    });

    if (sourceAssignments.length === 0) {
      return { success: false, error: "來源日期沒有值班安排" };
    }

    let totalCopied = 0;

    for (const targetDate of data.targetDates) {
      if (targetDate === data.sourceDate) continue;

      const targetDateObj = new Date(targetDate + "T00:00:00Z");
      const targetSlots = new Set(await getBusinessSlotsForDate(targetDate));

      if (targetSlots.size === 0) continue; // 非營業日跳過

      // 覆蓋模式：先清除目標日所有安排
      await prisma.dutyAssignment.deleteMany({
        where: { date: targetDateObj },
      });

      // 寫入（只複製雙方都存在的時段）
      const creates = sourceAssignments
        .filter((a) => targetSlots.has(a.slotTime))
        .map((a) => ({
          date: targetDateObj,
          slotTime: a.slotTime,
          staffId: a.staffId,
          dutyRole: a.dutyRole,
          participationType: a.participationType,
          notes: a.notes,
          createdByStaffId: a.createdByStaffId,
          storeId: currentStoreId(user),
        }));

      if (creates.length > 0) {
        await prisma.dutyAssignment.createMany({ data: creates, skipDuplicates: true });
        totalCopied += creates.length;
      }
    }

    revalidateDuty();
    return { success: true, data: { copiedCount: totalCopied } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// deleteDutyAssignment
// ============================================================

export async function deleteDutyAssignment(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("duty.manage");

    const assignment = await prisma.dutyAssignment.findUnique({ where: { id } });
    if (!assignment) return { success: false, error: "值班安排不存在" };
    assertStoreAccess(user, assignment.storeId);

    await prisma.dutyAssignment.delete({ where: { id } });
    revalidateDuty();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// clearSlotDutyAssignments — 清除某日某時段的所有值班
// ============================================================

export async function clearSlotDutyAssignments(
  date: string,
  slotTime: string
): Promise<ActionResult> {
  try {
    const user = await requirePermission("duty.manage");
    const dateObj = new Date(date + "T00:00:00Z");
    await prisma.dutyAssignment.deleteMany({
      where: { date: dateObj, slotTime, ...getStoreFilter(user) },
    });
    revalidateDuty();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// clearDateDutyAssignments — 清除某日所有值班
// ============================================================

export async function clearDateDutyAssignments(date: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("duty.manage");
    const dateObj = new Date(date + "T00:00:00Z");
    await prisma.dutyAssignment.deleteMany({
      where: { date: dateObj, ...getStoreFilter(user) },
    });
    revalidateDuty();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
