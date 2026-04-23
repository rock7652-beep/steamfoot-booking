/**
 * Referral binding service
 *
 * 用途：把新客戶綁定到推薦人（設定 `Customer.sponsorId`）。
 *
 * 設計原則（Phase 5 定案）：
 *   - 只為「新客」綁定，不回填舊會員
 *     → `customer.sponsorId` 已有值 → 直接 return，不覆蓋
 *   - 不能自己推薦自己
 *     → `customer.id === referrer.id` → return
 *   - 只跨店綁定同一店
 *     → 推薦人不屬於同 storeId → return（避免跨店資料耦合）
 *   - 一切失敗都靜默（絕不 throw）
 *     → DB 查詢/寫入 error、資料不存在、格式異常 → return，不拋
 *   - 綁定成功只做 sponsorId 更新，不寫 ReferralEvent
 *     → 事件埋點由 caller 自行處理（每個入口 source/context 不同）
 *
 * 使用方式（範例）：
 *   const cookieRef = cookieStore.get("pending-ref")?.value ?? null;
 *   const result = await bindReferralToCustomer({
 *     customerId: newCustomerId,
 *     storeId,
 *     referrerRef: cookieRef,
 *     source: "customer-register",
 *   });
 *   if (result.bound) cookieStore.delete("pending-ref");
 */

import { prisma } from "@/lib/db";
import { isReferralCodeFormat } from "@/lib/referral-code";
import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export type BindReferralReason =
  | "ok"
  | "no-ref"
  | "already-bound"
  | "self-referral"
  | "not-found"
  | "cross-store"
  | "error";

export interface BindReferralResult {
  bound: boolean;
  reason: BindReferralReason;
  referrerCustomerId?: string | null;
}

export interface BindReferralParams {
  customerId: string;
  storeId: string;
  /**
   * 推薦人識別碼 — 可為 referralCode（6 碼）或 Customer.id（cuid）。
   * 通常由 caller 從 `pending-ref` cookie 或註冊表單 `referrerId` 欄位讀取。
   * null / undefined / "" 都會 return `no-ref` 靜默略過。
   */
  referrerRef?: string | null;
  /** 呼叫來源（僅用於 logging，不會寫 DB） */
  source?: string;
  /** 在既有 $transaction 內呼叫時傳入 */
  tx?: TxClient;
}

export async function bindReferralToCustomer(
  params: BindReferralParams,
): Promise<BindReferralResult> {
  const ref = params.referrerRef?.trim();
  if (!ref) return { bound: false, reason: "no-ref" };

  try {
    const client = params.tx ?? prisma;
    const normalized = ref.toUpperCase();

    // 1. 解析推薦人：依 ref 格式分派查詢
    //    - 6 碼 referralCode → 查 referralCode 欄位
    //    - 其他（customer.id / cuid）→ 查 id 欄位
    //    用 isReferralCodeFormat 擋一層，避免 migration 前去查不存在的欄位。
    const referrer = isReferralCodeFormat(normalized)
      ? await client.customer.findFirst({
          where: { storeId: params.storeId, referralCode: normalized },
          select: { id: true, storeId: true },
        })
      : await client.customer.findFirst({
          where: { storeId: params.storeId, id: ref },
          select: { id: true, storeId: true },
        });

    if (!referrer) {
      return { bound: false, reason: "not-found" };
    }
    if (referrer.storeId !== params.storeId) {
      // 理論上 where 已過濾，但保險再確認一次
      return { bound: false, reason: "cross-store" };
    }
    if (referrer.id === params.customerId) {
      return { bound: false, reason: "self-referral" };
    }

    // 2. 載入被推薦人現況
    const customer = await client.customer.findUnique({
      where: { id: params.customerId },
      select: { id: true, storeId: true, sponsorId: true },
    });
    if (!customer) return { bound: false, reason: "not-found" };
    if (customer.storeId !== params.storeId) {
      return { bound: false, reason: "cross-store" };
    }
    if (customer.sponsorId) {
      // 已綁定 → 不覆蓋
      return {
        bound: false,
        reason: "already-bound",
        referrerCustomerId: customer.sponsorId,
      };
    }

    // 3. 綁定
    await client.customer.update({
      where: { id: params.customerId },
      data: { sponsorId: referrer.id },
    });

    return {
      bound: true,
      reason: "ok",
      referrerCustomerId: referrer.id,
    };
  } catch (err) {
    // 任何錯誤一律靜默，不影響主流程
    console.warn("[bindReferralToCustomer] silent failure", {
      customerId: params.customerId,
      source: params.source,
      error: err instanceof Error ? err.message : String(err),
    });
    return { bound: false, reason: "error" };
  }
}
