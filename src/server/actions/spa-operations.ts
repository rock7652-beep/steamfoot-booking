"use server";

import { z } from "zod";
import type { Prisma as SpaPrisma } from "@/generated/spa-client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { AppError, handleActionError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import type { ActionResult } from "@/types";
import { isSpaCompensationSchemaReady, isSpaOperationalSchemaReady } from "@/lib/spa-schema-readiness";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { requireSpaStore } from "@/lib/industry-module-server";
import {
  isStoreScopedSpaTreatmentId,
  SPA_SKILLS,
  spaSkillId,
} from "@/lib/spa-store-identifiers";

const skillKeys = ["body", "head", "foot", "face"] as const;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const treatmentSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(100),
  variant: z.string().trim().min(1).max(50),
  price: z.number().int().min(0).max(10_000_000),
  serviceMinutes: z.number().int().min(5).max(720),
  bufferMinutes: z.number().int().min(0).max(180),
  skillKeys: z.array(z.enum(skillKeys)).min(1),
  publicVisible: z.boolean(),
});

const staffSkillsSchema = z.object({
  staffId: z.string().min(1),
  skillKeys: z.array(z.enum(skillKeys)).min(1),
});

const weeklyAvailabilitySchema = z.object({
  staffId: z.string().min(1),
  availability: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(timePattern),
    endTime: z.string().regex(timePattern),
  })).max(7),
});

const exceptionSchema = z.object({
  staffId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["UNAVAILABLE", "AVAILABLE"]),
  startTime: z.string().regex(timePattern).nullable(),
  endTime: z.string().regex(timePattern).nullable(),
  reason: z.string().trim().max(200).nullable(),
});

const compensationSettingSchema = z.object({
  mode: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().min(0).max(1_000_000),
});

const compensationSchema = compensationSettingSchema.extend({
  staffId: z.string().min(1),
}).superRefine((data, context) => {
  if (data.mode === "PERCENTAGE" && data.value > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "百分比不可超過 100" });
  }
});

const staffSetupSchema = z.object({
  staffId: z.string().min(1),
  legalName: z.string().trim().min(1).max(100),
  phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^09\d{8}$/, "請輸入 09 開頭的 10 碼手機號碼")),
  email: z.union([z.string().email(), z.literal("")]),
  displayName: z.string().trim().min(1).max(100),
  colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  skillKeys: z.array(z.enum(skillKeys)).min(1),
  availability: weeklyAvailabilitySchema.shape.availability,
  compensation: compensationSettingSchema,
}).superRefine((data, context) => {
  if (new Set(data.availability.map((item) => item.dayOfWeek)).size !== data.availability.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["availability"], message: "同一天只能設定一個固定班表" });
  }
  if (data.availability.some((item) => item.startTime >= item.endTime)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["availability"], message: "結束時間必須晚於開始時間" });
  }
  if (data.compensation.mode === "PERCENTAGE" && data.compensation.value > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["compensation", "value"], message: "百分比不可超過 100" });
  }
});

async function requireSpaWrite(permission: "plans.edit" | "staff.manage") {
  const user = await requirePermission(permission);
  const storeId = await resolveWriteStoreId(user);
  await requireSpaStore(storeId);
  if (!(await isSpaOperationalSchemaReady())) {
    throw new AppError("CONFLICT", "SPA 資料功能更新中，請稍後再試");
  }
  return { user, storeId };
}

async function assertSpaStaff(staffId: string, storeId: string) {
  const staff = await prisma.staff.findFirst({ where: { id: staffId, storeId }, select: { id: true } });
  if (!staff) throw new AppError("NOT_FOUND", "找不到這位 SPA 人員");
}

async function ensureSkills(tx: SpaPrisma.TransactionClient, storeId: string) {
  for (const [sortOrder, skill] of SPA_SKILLS.entries()) {
    const id = spaSkillId(storeId, skill.key);
    const existing = await tx.spaSkill.findUnique({ where: { id }, select: { storeId: true } });
    if (existing && existing.storeId !== storeId) throw new AppError("CONFLICT", "專業項目識別碼已被其他門市使用");
    if (existing) await tx.spaSkill.update({ where: { id }, data: { name: skill.name, sortOrder, isActive: true } });
    else await tx.spaSkill.create({ data: { id, storeId, name: skill.name, sortOrder } });
  }
}

export async function saveSpaTreatment(input: z.infer<typeof treatmentSchema>): Promise<ActionResult> {
  let context: { userId?: string; storeId?: string } = {};
  try {
    const { user, storeId } = await requireSpaWrite("plans.edit");
    context = { userId: user.id, storeId };
    const data = treatmentSchema.parse(input);
    await spaPrisma.$transaction(async (tx) => {
      await ensureSkills(tx, storeId);
      const existing = await tx.spaTreatment.findUnique({ where: { id: data.id }, select: { storeId: true } });
      if (existing && existing.storeId !== storeId) throw new AppError("CONFLICT", "療程識別碼已被其他門市使用");
      if (!existing && !isStoreScopedSpaTreatmentId(storeId, data.id)) {
        throw new AppError("FORBIDDEN", "療程識別碼不屬於本店");
      }
      const treatmentData = { name: data.name, variantLabel: data.variant, price: data.price, serviceMinutes: data.serviceMinutes, bufferMinutes: data.bufferMinutes, publicVisible: data.publicVisible };
      if (existing) await tx.spaTreatment.update({ where: { id: data.id }, data: { ...treatmentData, isActive: true } });
      else await tx.spaTreatment.create({ data: { id: data.id, storeId, ...treatmentData } });
      await tx.spaTreatmentSkill.deleteMany({ where: { storeId, treatmentId: data.id } });
      await tx.spaTreatmentSkill.createMany({
        data: data.skillKeys.map((key) => ({ storeId, treatmentId: data.id, skillId: spaSkillId(storeId, key) })),
      });
    });
    revalidatePath("/dashboard/plans");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error, context); }
}

export async function saveSpaStaffSkills(input: z.infer<typeof staffSkillsSchema>): Promise<ActionResult> {
  let context: { userId?: string; storeId?: string } = {};
  try {
    const { user, storeId } = await requireSpaWrite("staff.manage");
    context = { userId: user.id, storeId };
    const data = staffSkillsSchema.parse(input);
    await assertSpaStaff(data.staffId, storeId);
    await spaPrisma.$transaction(async (tx) => {
      await ensureSkills(tx, storeId);
      await tx.spaStaffSkill.deleteMany({ where: { storeId, staffId: data.staffId } });
      await tx.spaStaffSkill.createMany({ data: data.skillKeys.map((key) => ({ storeId, staffId: data.staffId, skillId: spaSkillId(storeId, key) })) });
    });
    revalidatePath("/dashboard/staff");
    revalidatePath("/liff/design-preview/booking");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error, context); }
}

export async function saveSpaWeeklyAvailability(input: z.infer<typeof weeklyAvailabilitySchema>): Promise<ActionResult> {
  let context: { userId?: string; storeId?: string } = {};
  try {
    const { user, storeId } = await requireSpaWrite("staff.manage");
    context = { userId: user.id, storeId };
    const data = weeklyAvailabilitySchema.parse(input);
    if (new Set(data.availability.map((item) => item.dayOfWeek)).size !== data.availability.length) throw new AppError("VALIDATION", "同一天只能設定一個固定班表");
    if (data.availability.some((item) => item.startTime >= item.endTime)) throw new AppError("VALIDATION", "結束時間必須晚於開始時間");
    await assertSpaStaff(data.staffId, storeId);
    await spaPrisma.$transaction(async (tx) => {
      await tx.spaStaffAvailability.deleteMany({ where: { storeId, staffId: data.staffId } });
      if (data.availability.length) await tx.spaStaffAvailability.createMany({ data: data.availability.map((item) => ({ ...item, storeId, staffId: data.staffId })) });
    });
    revalidatePath("/dashboard/staff");
    revalidatePath("/liff/design-preview/booking");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error, context); }
}

export async function saveSpaAvailabilityException(input: z.infer<typeof exceptionSchema>): Promise<ActionResult> {
  let context: { userId?: string; storeId?: string } = {};
  try {
    const { user, storeId } = await requireSpaWrite("staff.manage");
    context = { userId: user.id, storeId };
    const data = exceptionSchema.parse(input);
    const hasStartTime = Boolean(data.startTime);
    const hasEndTime = Boolean(data.endTime);
    if (hasStartTime !== hasEndTime || (data.startTime && data.endTime && data.startTime >= data.endTime)) {
      throw new AppError("VALIDATION", "結束時間必須晚於開始時間");
    }
    if (data.type === "AVAILABLE" && (!data.startTime || !data.endTime)) {
      throw new AppError("VALIDATION", "臨時加班必須設定開始與結束時間");
    }
    await assertSpaStaff(data.staffId, storeId);
    if (data.type === "UNAVAILABLE") {
      const activeBookings = await spaPrisma.spaBooking.findMany({
        where: {
          storeId,
          serviceStaffId: data.staffId,
          bookingDate: parseTaiwanDateToDbDate(data.date),
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        select: {
          startTime: true,
          items: { select: { serviceMinutes: true, bufferMinutes: true } },
        },
      });
      const conflictingBookings = data.startTime && data.endTime
        ? activeBookings.filter((booking) => {
            const bookingStart = timeToMinutes(booking.startTime);
            const bookingEnd = bookingStart
              + booking.items.reduce((sum, item) => sum + item.serviceMinutes + item.bufferMinutes, 0);
            return bookingStart < timeToMinutes(data.endTime!)
              && timeToMinutes(data.startTime!) < bookingEnd;
          })
        : activeBookings;
      if (conflictingBookings.length > 0) {
        throw new AppError("CONFLICT", `此時段已有 ${conflictingBookings.length} 筆預約，請先更換芳療師後再設定請假`);
      }
    }
    await spaPrisma.spaStaffAvailabilityException.create({ data: { storeId, staffId: data.staffId, date: parseTaiwanDateToDbDate(data.date), type: data.type, startTime: data.startTime, endTime: data.endTime, reason: data.reason } });
    revalidatePath("/dashboard/staff");
    revalidatePath("/liff/design-preview/booking");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error, context); }
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function saveSpaStaffCompensation(input: z.infer<typeof compensationSchema>): Promise<ActionResult> {
  let context: { userId?: string; storeId?: string } = {};
  try {
    const { user, storeId } = await requireSpaWrite("staff.manage");
    context = { userId: user.id, storeId };
    if (!(await isSpaCompensationSchemaReady())) {
      throw new AppError("CONFLICT", "抽成設定功能更新中，請稍後再試");
    }
    const data = compensationSchema.parse(input);
    await assertSpaStaff(data.staffId, storeId);
    await spaPrisma.spaStaffCompensation.upsert({
      where: { staffId: data.staffId },
      create: { storeId, staffId: data.staffId, mode: data.mode, value: data.value },
      update: { mode: data.mode, value: data.value, isActive: true },
    });
    revalidatePath("/dashboard/staff");
    revalidatePath("/liff/manager-preview");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error, context); }
}

export async function saveSpaStaffSetup(input: z.infer<typeof staffSetupSchema>): Promise<ActionResult> {
  let context: { userId?: string; storeId?: string } = {};
  try {
    const { user, storeId } = await requireSpaWrite("staff.manage");
    context = { userId: user.id, storeId };
    if (!(await isSpaCompensationSchemaReady())) {
      throw new AppError("CONFLICT", "抽成設定功能更新中，請稍後再試");
    }
    const data = staffSetupSchema.parse(input);
    await assertSpaStaff(data.staffId, storeId);
    await prisma.$transaction(async (tx) => {
      const staff = await tx.staff.findUnique({
        where: { id_storeId: { id: data.staffId, storeId } },
        select: { userId: true },
      });
      if (!staff) throw new AppError("NOT_FOUND", "找不到這位 SPA 人員");
      const email = data.email ? normalizeEmail(data.email) : null;
      const duplicateUser = await tx.user.findFirst({
        where: {
          id: { not: staff.userId },
          OR: [
            { phone: data.phone },
            ...(email ? [{ email }] : []),
          ],
        },
        select: { id: true },
      });
      if (duplicateUser) throw new AppError("CONFLICT", "手機或 Email 已被其他帳號使用");
      await tx.user.update({
        where: { id: staff.userId },
        data: { name: data.legalName, phone: data.phone, email },
      });
      await tx.staff.update({
        where: { id_storeId: { id: data.staffId, storeId } },
        data: { displayName: data.displayName, colorCode: data.colorCode },
      });
    });
    await spaPrisma.$transaction(async (tx) => {
      await ensureSkills(tx, storeId);
      await tx.spaStaffSkill.deleteMany({ where: { storeId, staffId: data.staffId } });
      await tx.spaStaffSkill.createMany({
        data: data.skillKeys.map((key) => ({
          storeId,
          staffId: data.staffId,
          skillId: spaSkillId(storeId, key),
        })),
      });
      await tx.spaStaffAvailability.deleteMany({ where: { storeId, staffId: data.staffId } });
      if (data.availability.length) {
        await tx.spaStaffAvailability.createMany({
          data: data.availability.map((availability) => ({ ...availability, storeId, staffId: data.staffId })),
        });
      }
      await tx.spaStaffCompensation.upsert({
        where: { staffId: data.staffId },
        create: { storeId, staffId: data.staffId, ...data.compensation },
        update: { ...data.compensation, isActive: true },
      });
    });
    revalidatePath("/dashboard/staff");
    revalidatePath("/liff/design-preview/booking");
    revalidatePath("/liff/manager-preview");
    revalidatePath("/liff/staff-preview");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error, context); }
}
