/**
 * Referral Event Service Layer
 *
 * 提供統一的 ReferralEvent 寫入入口，供 server actions、queries、
 * 以及日後的 booking / register / line-entry / share-referral 流程接入。
 *
 * 這層不做權限檢查與 session 驗證（交給 actions 層），只負責：
 * - 欄位正規化
 * - 呼叫 prisma 寫入
 * - 回傳寫入結果
 */

import { prisma } from "@/lib/db";
import type { ReferralEvent, ReferralEventType } from "@prisma/client";

// ============================================================
// Input types
// ============================================================

/** 建立事件的共用輸入 */
export interface CreateReferralEventInput {
  storeId: string;
  type: ReferralEventType;
  customerId?: string | null;
  referrerId?: string | null;
  bookingId?: string | null;
  source?: string | null;
}

/** 特定事件類型的輸入（type 已鎖定，不需再傳） */
export type CreateReferralEventTypedInput = Omit<
  CreateReferralEventInput,
  "type"
>;

// ============================================================
// Core writer
// ============================================================

/**
 * 建立 ReferralEvent — 所有輔助函式最終都會呼叫這個。
 *
 * 注意：
 * - 不做權限檢查（服務層職責）
 * - customerId / referrerId / bookingId 允許 undefined 或 null，皆視為未填
 * - 寫入失敗會 throw（讓呼叫端決定 fire-and-forget 或 handle）
 */
export async function createReferralEvent(
  input: CreateReferralEventInput,
): Promise<ReferralEvent> {
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

// ============================================================
// Typed helpers — 對應 ReferralEventType 的各個值
// ============================================================

/** SHARE — 使用者按下分享按鈕 */
export async function createShareEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "SHARE" });
}

/** LINK_CLICK — 被分享的連結被點開 */
export async function createLinkClickEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "LINK_CLICK" });
}

/** LINE_JOIN — 透過轉介紹加入 LINE OA */
export async function createLineJoinEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "LINE_JOIN" });
}

/** LINE_ENTRY — 使用者進入 LIFF / LINE Entry Point */
export async function createLineEntryEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "LINE_ENTRY" });
}

/** REGISTER — 註冊成為顧客 */
export async function createRegisterEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "REGISTER" });
}

/** BOOKING_CREATED — 預約成立 */
export async function createBookingCreatedEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "BOOKING_CREATED" });
}

/** BOOKING_COMPLETED — 預約完成（到店） */
export async function createBookingCompletedEvent(
  input: CreateReferralEventTypedInput,
): Promise<ReferralEvent> {
  return createReferralEvent({ ...input, type: "BOOKING_COMPLETED" });
}
