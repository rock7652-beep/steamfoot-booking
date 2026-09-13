"use server";
import type {Prisma} from "../../../generated/spa-client";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { handleActionError, AppError } from "@/lib/errors";
import { requireSpaStore } from "@/lib/industry-module-server";
import { checkPermission, isStaffRole } from "@/lib/permissions";
import { spaPrisma } from "@/lib/spa-db";
import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { applicableLocations, spaEndTime, staffAvailable, validSpaDate } from "@/lib/spa-scheduling";
import type { ActionResult } from "@/types";

const inputSchema = z.object({
  customerId: z.string().min(1), serviceStaffId: z.string().min(1),
  serviceLocationId: z.string().min(1).optional(),
  treatmentIds: z.array(z.string().min(1)).min(1).max(8).refine(ids => new Set(ids).size === ids.length, "服務項目不可重複"),
  bookingDate: z.string().refine(validSpaDate, "日期不正確"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), requestKey: z.string().min(8).max(100),
  notes: z.string().trim().max(500).optional(),
});
export type CreateSpaBookingInput = z.infer<typeof inputSchema>;
const editSchema = inputSchema.extend({ bookingId: z.string().min(1), expectedUpdatedAt: z.string().datetime() });
export type UpdateSpaBookingInput = z.infer<typeof editSchema>;
const cancelSchema = z.object({ bookingId: z.string().min(1), expectedUpdatedAt: z.string().datetime() });
const active = ["PENDING", "CONFIRMED"] as const;

async function authorizedStore(permission: "booking.create" | "booking.update") {
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) throw new AppError("UNAUTHORIZED", "請先以店員帳號登入");
  if (!(await checkPermission(user.role, user.staffId, permission))) {
    throw new AppError("FORBIDDEN", "您沒有此操作的權限");
  }

  // A Server Action request does not reliably retain the rewritten pathname,
  // so obtain its route-scoped store from the proxy cookie.  The cookie is
  // only a requested context: the signed-in user must also own an active Staff
  // row in that exact store before any SPA data can be touched.
  const context = await getStoreContext();
  if (!context) throw new AppError("UNAUTHORIZED", "缺少目前店舖，請重新開啟 SPA 排程頁");
  if (user.role !== "ADMIN") {
    const staff = await prisma.staff.findFirst({
      where: { id: user.staffId ?? undefined, userId: user.id, storeId: context.storeId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!staff) throw new AppError("FORBIDDEN", "您無權操作目前店舖");
  }

  const storeId = context.storeId;
  await requireSpaStore(storeId);
  const installation = await prisma.storeModuleInstallation.findUnique({ where: { storeId }, select: { status: true } });
  if (installation?.status !== "ACTIVE") throw new AppError("FORBIDDEN", "此店尚未完成服務模組設定");
  return storeId;
}

function actionError(error: unknown): ActionResult<{ bookingId: string }> {
  // Prisma may expose exclusion violations as P2004 or an unknown request error.
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : "";
  if (code === "P2034" || code === "P2002" || /SpaBooking_(staff|location)_no_overlap|23P01/.test(message)) {
    return { success: false, error: "時段或預約已被其他人更新，請重新確認；原本輸入已保留" };
  }
  return handleActionError(error);
}

async function saveBooking(storeId: string, data: CreateSpaBookingInput, edit?: UpdateSpaBookingInput, transaction?: Prisma.TransactionClient, group?:{id:string;index:number}) {
  const [customer, staff] = await Promise.all([
    prisma.customer.findFirst({ where: { id: data.customerId, storeId }, select: { id: true } }),
    prisma.staff.findFirst({ where: { id: data.serviceStaffId, storeId, status: "ACTIVE" }, select: { id: true } }),
  ]);
  if (!customer || !staff) throw new AppError("VALIDATION", "顧客或服務人員不屬於目前店家");
  const run = async (tx:Prisma.TransactionClient) => {
    // One store lock also serializes request-key retries and moves between resources.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
    const existing = edit ? await tx.spaBooking.findFirst({ where: { id: edit.bookingId, storeId } }) : null;
    if (edit && (!existing || !active.includes(existing.status as typeof active[number]) || existing.updatedAt.toISOString() !== edit.expectedUpdatedAt)) {
      throw new AppError("CONFLICT", "預約已變更或無法修改，請關閉面板後重新開啟");
    }
    if(edit && existing?.partyGroupId && existing.customerId!==data.customerId)throw new AppError("VALIDATION","同行預約的主要聯絡人不能個別更換");
    if (!edit) {
      const duplicate = await tx.spaBooking.findFirst({ where: { storeId, requestKey: data.requestKey } });
      if (duplicate) return { id: duplicate.id };
    }
    if (!await prisma.staff.findFirst({ where: { id: data.serviceStaffId, storeId, status: "ACTIVE" }, select: { id: true } })) throw new AppError("CONFLICT", "此人員已停用，請重新選擇服務人員");
    const treatments = await tx.spaTreatment.findMany({
      where: { storeId, id: { in: data.treatmentIds }, isActive: true },
      include: { skills: true, serviceLocations: true },
    });
    if (treatments.length !== data.treatmentIds.length) throw new AppError("VALIDATION", "服務項目已停用或不屬於目前店家");
    const ordered = data.treatmentIds.map(id => treatments.find(t => t.id === id)!);
    let endTime: string;
    try { endTime = spaEndTime(data.startTime, ordered); } catch (e) { throw new AppError("VALIDATION", (e as Error).message); }
    const locations = await tx.spaServiceLocation.findMany({ where: { storeId, isActive: true } });
    const allowed = applicableLocations(locations, ordered.map(t => t.serviceLocations.map(l => l.serviceLocationId)));
    const locationId = data.serviceLocationId ?? (allowed.length === 1 ? allowed[0].id : undefined);
    if (!locationId || !allowed.some(l => l.id === locationId)) throw new AppError("VALIDATION", "請選擇適用於所有服務項目的服務位置");
    const skills = await tx.spaStaffSkill.findMany({ where: { storeId, staffId: data.serviceStaffId, skill: { isActive: true } } });
    if (ordered.some(t => t.skills.some(s => !skills.some(ss => ss.skillId === s.skillId)))) throw new AppError("VALIDATION", "此人員未設定為可提供所選服務");
    const bookingDate = parseTaiwanDateToDbDate(data.bookingDate);
    const [regular, exceptions] = await Promise.all([
      tx.spaStaffAvailability.findUnique({ where: { storeId_staffId_dayOfWeek: { storeId, staffId: data.serviceStaffId, dayOfWeek: bookingDate.getUTCDay() } } }),
      tx.spaStaffAvailabilityException.findMany({ where: { storeId, staffId: data.serviceStaffId, date: bookingDate } }),
    ]);
    if (!staffAvailable(data.startTime, endTime, regular, exceptions)) throw new AppError("VALIDATION", "此服務人員在所選時段未排班或休假");
    const overlap = await tx.spaBooking.findFirst({ where: {
      storeId, bookingDate, ...(edit ? { id: { not: edit.bookingId } } : {}),
      status: { in: [...active] }, startTime: { lt: endTime }, endTime: { gt: data.startTime },
      OR: [{ serviceStaffId: data.serviceStaffId }, { serviceLocationId: locationId }],
    } });
    if (overlap) throw new AppError("CONFLICT", overlap.serviceStaffId === data.serviceStaffId ? "服務人員在此時段已有預約" : "服務位置在此時段已被使用");
    const values = {
      customerId: data.customerId, serviceStaffId: data.serviceStaffId, serviceLocationId: locationId,
      bookingDate, startTime: data.startTime, endTime,
      serviceNameSnapshot: ordered.map(t => t.name).join("＋"), totalPriceSnapshot: ordered.reduce((sum, t) => sum + Number(t.price), 0),
      notes: data.notes || null,
    };
    const itemRows = ordered.map((t, sortOrder) => ({
      storeId,
      treatmentId: t.id,
      treatmentNameSnapshot: t.name,
      priceSnapshot: t.price,
      serviceMinutes: t.serviceMinutes,
      bufferMinutes: t.bufferMinutes,
      sortOrder,
    }));
    if (edit) {
      const booking = await tx.spaBooking.update({
        where: { id_storeId: { id: edit.bookingId, storeId } },
        data: values,
        select: { id: true },
      });
      await tx.spaBookingItem.deleteMany({ where: { bookingId: booking.id, storeId } });
      await tx.spaBookingItem.createMany({
        data: itemRows.map(item => ({ ...item, bookingId: booking.id })),
      });
      return booking;
    }
    // Prisma's checked create input cannot mix this composite relation's scalar
    // keys (storeId/serviceLocationId) with a nested item create.  Persist the
    // independent SPA booking first, then its immutable item snapshots in the
    // same transaction.
    const booking = await tx.spaBooking.create({
      data: { ...values, storeId, requestKey: data.requestKey, ...(group?{partyGroupId:group.id,guestIndex:group.index}:{}) },
      select: { id: true },
    });
    await tx.spaBookingItem.createMany({
      data: itemRows.map(item => ({ ...item, bookingId: booking.id })),
    });
    return booking;
  };
  return transaction?run(transaction):spaPrisma.$transaction(run,{timeout:15000});
}

export async function createSpaBookingAction(input: CreateSpaBookingInput): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "預約資料不完整" };
  try {
    const storeId = await authorizedStore("booking.create");
    const booking = await saveBooking(storeId, parsed.data);
    revalidatePath("/dashboard/spa-schedule");
    return { success: true, data: { bookingId: booking.id } };
  } catch (e) { return actionError(e); }
}

export async function updateSpaBookingAction(input: UpdateSpaBookingInput): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "預約資料不完整" };
  try {
    const storeId = await authorizedStore("booking.update");
    const booking = await saveBooking(storeId, parsed.data, parsed.data);
    revalidatePath("/dashboard/spa-schedule");
    return { success: true, data: { bookingId: booking.id } };
  } catch (e) { return actionError(e); }
}

export async function cancelSpaBookingAction(input: z.infer<typeof cancelSchema>): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "預約資料不完整" };
  try {
    const storeId = await authorizedStore("booking.update");
    await spaPrisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
      const booking = await tx.spaBooking.findFirst({ where: { id: parsed.data.bookingId, storeId } });
      if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
      if (booking.status === "CANCELLED") return;
      if (!active.includes(booking.status as typeof active[number]) || booking.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) throw new AppError("CONFLICT", "預約已變更或無法取消，請重新開啟");
      await tx.spaBooking.update({
        where: { id_storeId: { id: booking.id, storeId } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    });
    revalidatePath("/dashboard/spa-schedule");
    return { success: true, data: { bookingId: parsed.data.bookingId } };
  } catch (e) { return actionError(e); }
}

const groupSchema=z.object({requestKey:z.string().uuid(),customerId:z.string().min(1),guests:z.array(inputSchema).min(2).max(3)}).refine(d=>d.guests.every(g=>g.customerId===d.customerId&&g.bookingDate===d.guests[0].bookingDate),"同行預約須使用同一主要聯絡人與日期").refine(d=>new Set(d.guests.map(g=>g.requestKey)).size===d.guests.length,"同行預約不可重複");
export async function createSpaGroupBookingAction(input:z.infer<typeof groupSchema>){
 try{
  const d=groupSchema.parse(input),storeId=await authorizedStore("booking.create"),fingerprint=JSON.stringify(d);
  const group=await spaPrisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`},0))`;
   const previous=await tx.spaBookingGroup.findUnique({where:{storeId_requestKey:{storeId,requestKey:d.requestKey}}});
   if(previous){if(previous.fingerprint!==fingerprint)throw new AppError("CONFLICT","同行預約內容已變更，請重新開啟");return previous;}
   if(await tx.spaBooking.count({where:{storeId,requestKey:{in:d.guests.map(g=>g.requestKey)}}}))throw new AppError("CONFLICT","其中一位已有預約紀錄，請先重新確認");
   const created=await tx.spaBookingGroup.create({data:{storeId,customerId:d.customerId,requestKey:d.requestKey,fingerprint}});
   for(let i=0;i<d.guests.length;i++)await saveBooking(storeId,d.guests[i],undefined,tx,{id:created.id,index:i+1});
   return created;
  },{timeout:25000});
  revalidatePath("/dashboard/spa-schedule");return{success:true as const,data:{groupId:group.id}};
 }catch(e){return actionError(e);}
}
