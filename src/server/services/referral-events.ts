import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { ReferralEvent, ReferralEventType } from "@prisma/client";

/** 建立 ReferralEvent 的共用輸入。 */
export interface CreateReferralEventInput {
  storeId: string;
  type: ReferralEventType;
  customerId?: string | null;
  referrerId?: string | null;
  bookingId?: string | null;
  source?: string | null;
}

/** 特定事件類型的輸入（type 已鎖定，不需再傳）。 */
export type CreateReferralEventTypedInput = Omit<
  CreateReferralEventInput,
  "type"
>;

/**
 * ReferralEvent.storeId 是事件歸屬的 single source of truth。
 *
 * 任何附帶的 Customer / referrer / Booking 都必須存在、未合併（Customer），
 * 且與事件 storeId 同店。這層是所有 service helper 的共同防線，避免呼叫端
 * 傳錯 ID 後污染推薦漏斗或跨店報表。
 */
export async function assertReferralEventStoreConsistency(
  input: CreateReferralEventInput,
): Promise<void> {
  const [customer, referrer, booking] = await Promise.all([
    input.customerId
      ? prisma.customer.findUnique({
          where: { id: input.customerId },
          select: { id: true, storeId: true, mergedIntoCustomerId: true },
        })
      : Promise.resolve(null),
    input.referrerId
      ? prisma.customer.findUnique({
          where: { id: input.referrerId },
          select: { id: true, storeId: true, mergedIntoCustomerId: true },
        })
      : Promise.resolve(null),
    input.bookingId
      ? prisma.booking.findUnique({
          where: { id: input.bookingId },
          select: { id: true, storeId: true },
        })
      : Promise.resolve(null),
  ]);

  if (input.customerId && !customer) {
    throw new AppError("VALIDATION", "推薦事件顧客不存在");
  }
  if (input.referrerId && !referrer) {
    throw new AppError("VALIDATION", "推薦事件推薦人不存在");
  }
  if (input.bookingId && !booking) {
    throw new AppError("VALIDATION", "推薦事件預約不存在");
  }

  if (customer?.mergedIntoCustomerId || referrer?.mergedIntoCustomerId) {
    throw new AppError("VALIDATION", "推薦事件不可使用已合併顧客");
  }

  const relatedStoreIds = [
    customer?.storeId,
    referrer?.storeId,
    booking?.storeId,
  ].filter((storeId): storeId is string => Boolean(storeId));

  if (relatedStoreIds.some((storeId) => storeId !== input.storeId)) {
    throw new AppError("VALIDATION", "推薦事件店舖不一致");
  }
}

/**
 * 建立 ReferralEvent。所有 typed helpers 最終都會走這裡，因此每一筆事件
 * 都先通過同店一致性驗證，再寫入資料庫。
 */
export async function createReferralEvent(
  input: CreateReferralEventInput,
): Promise<ReferralEvent> {
  await assertReferralEventStoreConsistency(input);

  return prisma.referralEvent.create({
    data: {
      storeId: input.storeId,
      type: input.type,
      customerId: input.customerId ?? null,
      referrerId: input.referrerId ?? null,
      bookingId: input.bookingId ?? null,
      source: input.source ?? null,
    },
  });
}

/** SHARE — 使用者按下分享按鈕。 */
export async function createShareEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "SHARE" });
}

/** LINK_CLICK — 被分享的連結被點開。 */
export async function createLinkClickEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "LINK_CLICK" });
}

/** LINE_JOIN — 透過轉介紹加入 LINE OA。 */
export async function createLineJoinEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "LINE_JOIN" });
}

/** LINE_ENTRY — 使用者進入 LIFF / LINE Entry Point。 */
export async function createLineEntryEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "LINE_ENTRY" });
}

/** REGISTER — 註冊成為顧客。 */
export async function createRegisterEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "REGISTER" });
}

/** BOOKING_CREATED — 預約成立。 */
export async function createBookingCreatedEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "BOOKING_CREATED" });
}

/** BOOKING_COMPLETED — 預約完成（到店）。 */
export async function createBookingCompletedEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "BOOKING_COMPLETED" });
}
