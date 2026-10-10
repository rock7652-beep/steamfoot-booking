"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requirePermission, requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { requireSteamfootStore } from "@/lib/industry-module-server";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { normalizePhone } from "@/lib/normalize";
import { revalidateBookingMutation, revalidateBookingTransactionMutation } from "@/lib/booking-route-mutation";
import { initializeBookingParticipants, linkBookingParticipantCustomer } from "@/server/services/booking-participants";
import type { BookingParticipantRow } from "@/server/services/booking-participants";
import type { ActionResult } from "@/types";
import { checkCustomerLimit, getTrialSettings } from "@/lib/shop-config";
import { collectParticipantTrialInTransaction, completeParticipantOwnPlan, resolveUnattendedParticipant } from "@/server/services/booking-participant-payment";
import { paymentMethodValues } from "@/lib/payment-splits";
import { createBookingCompletedEvent } from "@/server/services/referral-events";
import { checkCustomerLimitOrThrow } from "@/lib/usage-gate";
import { recordOperationAudit } from "@/server/services/operation-audit";
import { addBookingWalkIn } from "@/server/services/booking-participant-walk-in";
import { createCustomerSchema } from "@/lib/validators/customer";

// Keep the unfinished rollout inaccessible until the reviewed DDL is deployed.
function assertParticipantRollout() {
  if (process.env.BOOKING_PARTICIPANTS_ENABLED !== "true") {
    throw new AppError("BUSINESS_RULE", "同行者功能尚未開放");
  }
}

const identitySchema = z.object({
  bookingId: z.string().min(1).max(128),
  position: z.number().int().min(2).max(4),
  customerId: z.string().min(1).max(128),
  revision: z.number().int().positive(),
});

const participantOperationSchema = z.object({
  bookingId: z.string().min(1).max(128), position: z.number().int().positive(), revision: z.number().int().positive(),
});

export async function collectBookingParticipantTrial(input: {
  bookingId: string; position: number; revision: number; amount: number;
  paymentMethod: (typeof paymentMethodValues)[number]; note?: string;
}): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requireWritablePermission("trial.confirm");
    await requireWritablePermission("booking.update");
    const storeId = await resolveWriteStoreId(user);
    await requireSteamfootStore(storeId); await assertStoreSubscriptionWritable(storeId); assertParticipantRollout();
    const data = participantOperationSchema.extend({ amount: z.number().int().min(0).max(1_000_000),
      paymentMethod: z.enum(paymentMethodValues), note: z.string().trim().max(500).optional() }).parse(input);
    const settings = await getTrialSettings(storeId);
    const result = await prisma.$transaction(async tx => {
      const slots = await initializeBookingParticipants(tx, { storeId, bookingId: data.bookingId });
      const person = slots.find(slot => slot.position === data.position);
      if (!person) throw new AppError("NOT_FOUND", "本次預約沒有這個名額");
      return collectParticipantTrialInTransaction(tx, { storeId, participantId: person.id, revision: data.revision,
        amount: data.amount, paymentMethod: data.paymentMethod, note: data.note, serviceStaffId: user.staffId ?? null, settings });
    });
    if (result.created) {
      // Each participant, not the group booker. Same-request retries emit no event.
      try {
        const customer = await prisma.customer.findFirst({ where: { id: result.customerId, storeId }, select: { sponsorId: true } });
        await createBookingCompletedEvent({ storeId, customerId: result.customerId, referrerId: customer?.sponsorId ?? null,
          bookingId: result.bookingId, source: "participant-collect-and-complete" });
      } catch { console.error("[Participant] completion event failed"); }
    }
    revalidateBookingMutation(result.customerId); revalidateBookingTransactionMutation(result.customerId);
    return { success: true, data: { transactionId: result.transactionId } };
  } catch (error) { return handleActionError(error); }
}

export async function resolveBookingParticipant(input: {
  bookingId: string; position: number; revision: number; status: "NO_SHOW" | "CANCELLED";
}): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("booking.update");
    const storeId = await resolveWriteStoreId(user);
    await requireSteamfootStore(storeId); await assertStoreSubscriptionWritable(storeId); assertParticipantRollout();
    const data = participantOperationSchema.extend({ status: z.enum(["NO_SHOW", "CANCELLED"]) }).parse(input);
    await prisma.$transaction(async tx => {
      const slots = await initializeBookingParticipants(tx, { storeId, bookingId: data.bookingId });
      const person = slots.find(slot => slot.position === data.position);
      if (!person) throw new AppError("NOT_FOUND", "本次預約沒有這個名額");
      await resolveUnattendedParticipant(tx, { storeId, participantId: person.id, revision: data.revision, status: data.status });
    });
    revalidateBookingMutation();
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error); }
}

/** Exact phone search; never silently choose a customer on the cashier's behalf. */
export async function findBookingCompanionByPhone(input: {
  bookingId: string; phone: string;
}): Promise<ActionResult<Array<{ id: string; name: string; phoneMasked: string }>>> {
  try {
    const user = await requireWritablePermission("booking.update");
    await requirePermission("customer.read");
    const storeId = await resolveWriteStoreId(user);
    await requireSteamfootStore(storeId);
    assertParticipantRollout();
    const data = z.object({
      bookingId: z.string().min(1).max(128),
      phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^09\d{8}$/, "請輸入完整手機號碼")),
    }).parse(input);
    const booking = await prisma.booking.findFirst({ where: { id: data.bookingId, storeId }, select: { id: true } });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    const customers = await prisma.customer.findMany({
      where: { storeId, phone: data.phone, mergedIntoCustomerId: null },
      select: { id: true, name: true, phone: true },
      orderBy: { id: "asc" }, take: 10,
    });
    return { success: true, data: customers.map(customer => ({
      id: customer.id, name: customer.name,
      phoneMasked: customer.phone ? `${customer.phone.slice(0, 4)}***${customer.phone.slice(-3)}` : "",
    })) };
  } catch (error) { return handleActionError(error); }
}

/** Confirm an existing customer and fill a reserved slot atomically. */
export async function attachBookingCompanion(input: z.infer<typeof identitySchema>): Promise<ActionResult<BookingParticipantRow[]>> {
  try {
    const user = await requireWritablePermission("booking.update");
    await requirePermission("customer.read");
    const storeId = await resolveWriteStoreId(user);
    await requireSteamfootStore(storeId);
    await assertStoreSubscriptionWritable(storeId);
    assertParticipantRollout();
    const data = identitySchema.parse(input);
    const participants = await prisma.$transaction(async tx => {
      const slots = await initializeBookingParticipants(tx, { storeId, bookingId: data.bookingId });
      const slot = slots.find(item => item.position === data.position);
      if (!slot) throw new AppError("NOT_FOUND", "本次預約沒有這個同行名額");
      await linkBookingParticipantCustomer(tx, {
        storeId, participantId: slot.id, customerId: data.customerId, revision: data.revision,
      });
      return initializeBookingParticipants(tx, { storeId, bookingId: data.bookingId });
    });
    revalidateBookingMutation(data.customerId);
    return { success: true, data: participants };
  } catch (error) { return handleActionError(error); }
}

/** Create and attach together: a stale slot must not leave an orphan profile. */
export async function createBookingCompanion(input: {
  bookingId: string; position: number; revision: number; name: string; phone: string;
}): Promise<ActionResult<{ customerId: string; name: string }>> {
  try {
    const user = await requireWritablePermission("booking.update");
    await requireWritablePermission("customer.create");
    await requirePermission("customer.read");
    const storeId = await resolveWriteStoreId(user);
    await requireSteamfootStore(storeId);
    await assertStoreSubscriptionWritable(storeId);
    assertParticipantRollout();
    const slotInput = identitySchema.omit({ customerId: true }).parse(input);
    const customerInput = createCustomerSchema.parse({ name: input.name, phone: input.phone });
    if (!customerInput.phone) throw new AppError("BUSINESS_RULE", "請填同行者手機號碼");
    const limit = await checkCustomerLimit(storeId);
    if (!limit.allowed) throw new AppError("BUSINESS_RULE", `體驗版顧客上限 ${limit.limit} 位已達，請升級方案以繼續新增`);
    const result = await prisma.$transaction(async tx => {
      const slots = await initializeBookingParticipants(tx, { storeId, bookingId: slotInput.bookingId });
      const slot = slots.find(item => item.position === slotInput.position);
      if (!slot || slot.customerId || slot.status !== "PENDING" || slot.revision !== slotInput.revision) {
        throw new AppError("CONFLICT", "同行者資料已變更，請重新確認");
      }
      const existing = await tx.customer.findFirst({ where: { storeId, phone: customerInput.phone }, select: { id: true } });
      if (existing) throw new AppError("BUSINESS_RULE", "此手機已在本店建檔，請重新查詢並確認同行者");
      await checkCustomerLimitOrThrow(await tx.customer.count({ where: { storeId } }), storeId, tx);
      const customer = await tx.customer.create({ data: {
        storeId, name: customerInput.name, phone: customerInput.phone,
        customerStage: "LEAD", selfBookingEnabled: false, assignedStaffId: null,
      }, select: { id: true, name: true } });
      await linkBookingParticipantCustomer(tx, { storeId, participantId: slot.id, customerId: customer.id, revision: slotInput.revision });
      return { customerId: customer.id, name: customer.name };
    }, { timeout: 15_000 });
    revalidateBookingMutation(result.customerId);
    return { success: true, data: result };
  } catch (error) { return handleActionError(error); }
}

/** Adds one stable WALK_IN slot; identity is filled in the same existing drawer. */
export async function addBookingParticipant(input: { bookingId: string; requestId: string }): Promise<ActionResult<BookingParticipantRow>> {
  try {
    const user = await requireWritablePermission("booking.update");
    await requirePermission("customer.read");
    const storeId = await resolveWriteStoreId(user);
    await requireSteamfootStore(storeId); await assertStoreSubscriptionWritable(storeId); assertParticipantRollout();
    const data = z.object({ bookingId: z.string().min(1).max(128), requestId: z.string().uuid() }).parse(input);
    const person = await prisma.$transaction(async tx => {
      const result = await addBookingWalkIn(tx, { ...data, storeId });
      if (result.created) await recordOperationAudit({ actor: user, actorUserId: user.id, storeId, module: "STEAM",
        targetType: "Booking", targetId: data.bookingId, action: "ADD_BOOKING_PARTICIPANT", summary: "在原預約臨時加入 1 位同行者",
        after: { participantId: result.id, position: result.position, source: "WALK_IN" } }, tx);
      return result;
    }, { timeout: 15_000 });
    revalidateBookingMutation();
    return { success: true, data: person };
  } catch (error) { return handleActionError(error); }
}

export async function completeBookingParticipantPlan(input: { bookingId: string; position: number; revision: number; walletId: string }): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("booking.update");
    const storeId = await resolveWriteStoreId(user);
    await requireSteamfootStore(storeId); await assertStoreSubscriptionWritable(storeId); assertParticipantRollout();
    const data = participantOperationSchema.extend({ walletId: z.string().min(1).max(128) }).parse(input);
    const result = await prisma.$transaction(async tx => {
      const slots = await initializeBookingParticipants(tx, { storeId, bookingId: data.bookingId });
      const person = slots.find(slot => slot.position === data.position);
      if (!person) throw new AppError("NOT_FOUND", "本次預約沒有這個名額");
      const result = await completeParticipantOwnPlan(tx, { storeId, participantId: person.id, revision: data.revision, walletId: data.walletId, serviceStaffId: user.staffId ?? null });
      if (result.created) await recordOperationAudit({ actor: user, actorUserId: user.id, storeId, module: "STEAM",
        targetType: "Booking", targetId: data.bookingId, action: "COMPLETE_PARTICIPANT_PLAN", summary: "完成這位顧客的本人方案服務，扣 1 堂",
        after: { participantId: person.id, customerId: result.customerId, walletId: data.walletId, sessions: 1 } }, tx);
      return result;
    }, { timeout: 15_000 });
    revalidateBookingMutation(result.customerId); revalidateBookingTransactionMutation(result.customerId);
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error); }
}
