import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Prisma } from "@prisma/client";

/**
 * resolveCustomerStaffAssignment — 顧客歸屬店長 fallback 解析
 *
 * 當顧客的 `Customer.assignedStaffId` 為 null（或指向已離職 / 跨店的店長）時，
 * 本 helper 按下列優先序找到一個有效的店長，並在 tx 內寫回 customer.assignedStaffId，
 * 讓後續購買 / 推薦 / 集點流程能連上。
 *
 *   1. existing        — 顧客本來就有有效的 assignedStaffId
 *   2. referral_staff  — 呼叫者由 URL query (?staff=...) 帶入的 referralStaffId
 *   3. sponsor_staff   — 顧客的推薦人 (sponsorId → Customer.assignedStaffId)
 *   4. store_owner     — 該店最早建立的 ACTIVE owner（isOwner=true, status=ACTIVE）
 *
 * 若 4 條都走不到 → throw `VALIDATION`。
 *
 * 呼叫端至少套用（MVP 僅套第 1 項，其他 PR 逐步補）：
 *   - initiateCustomerPlanPurchase（本次）
 *   - customer registration / profile completion（後續）
 *   - booking creation（後續）
 *   - manual customer creation（後續）
 */

type TxClient = Prisma.TransactionClient | typeof prisma;

export type StaffAssignmentSource =
  | "existing"
  | "referral_staff"
  | "sponsor_staff"
  | "store_owner";

export interface ResolvedStaffAssignment {
  staffId: string;
  source: StaffAssignmentSource;
}

export interface ResolveOptions {
  /** URL query 帶入的 referral staff id（例：/s/zhubei/book/shop?staff=xxx）*/
  referralStaffId?: string | null;
  /** 在 Prisma $transaction 內呼叫時傳入，讓 update 走同一個 tx */
  tx?: Prisma.TransactionClient;
  /** resolve 到非 existing source 時，是否將 staffId 寫回 customer（預設 true）*/
  persist?: boolean;
}

/**
 * 回傳有效 staff id + 來源。會在找到新歸屬時把 staffId 寫回 customer.assignedStaffId。
 */
export async function resolveCustomerStaffAssignment(
  customerId: string,
  storeId: string,
  opts: ResolveOptions = {}
): Promise<ResolvedStaffAssignment> {
  const client: TxClient = opts.tx ?? prisma;
  const persist = opts.persist ?? true;

  const customer = await client.customer.findUnique({
    where: { id: customerId },
    select: {
      assignedStaffId: true,
      sponsorId: true,
      storeId: true,
    },
  });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
  if (customer.storeId !== storeId) {
    throw new AppError("VALIDATION", "顧客不屬於此店別");
  }

  // 1. Existing — 舊值仍然有效就直接用
  if (customer.assignedStaffId) {
    const staff = await client.staff.findUnique({
      where: { id: customer.assignedStaffId },
      select: { id: true, storeId: true, status: true },
    });
    if (staff && staff.storeId === storeId && staff.status === "ACTIVE") {
      return { staffId: staff.id, source: "existing" };
    }
    // 舊值 stale（店長離職 / 跨店）→ 繼續往下 fallback
  }

  // 2. Referral staff — 呼叫端從 URL 帶入（本 PR 暫未用，helper 已準備好）
  if (opts.referralStaffId) {
    const staff = await client.staff.findUnique({
      where: { id: opts.referralStaffId },
      select: { id: true, storeId: true, status: true },
    });
    if (staff && staff.storeId === storeId && staff.status === "ACTIVE") {
      if (persist) await persistAssignment(client, customerId, staff.id);
      return { staffId: staff.id, source: "referral_staff" };
    }
  }

  // 3. Sponsor's assigned staff — 跟推薦人同店長
  if (customer.sponsorId) {
    const sponsor = await client.customer.findUnique({
      where: { id: customer.sponsorId },
      select: { assignedStaffId: true, storeId: true },
    });
    if (
      sponsor?.assignedStaffId &&
      sponsor.storeId === storeId
    ) {
      const staff = await client.staff.findUnique({
        where: { id: sponsor.assignedStaffId },
        select: { id: true, storeId: true, status: true },
      });
      if (staff && staff.storeId === storeId && staff.status === "ACTIVE") {
        if (persist) await persistAssignment(client, customerId, staff.id);
        return { staffId: staff.id, source: "sponsor_staff" };
      }
    }
  }

  // 4. Store owner — 最早建立的 ACTIVE owner（決定性，兩次呼叫結果一致）
  const owner = await client.staff.findFirst({
    where: { storeId, isOwner: true, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (owner) {
    if (persist) await persistAssignment(client, customerId, owner.id);
    return { staffId: owner.id, source: "store_owner" };
  }

  // 5. 無法解析 — 店未設店長
  throw new AppError("VALIDATION", "此店尚未設定有效店長，請聯絡客服");
}

async function persistAssignment(
  client: TxClient,
  customerId: string,
  staffId: string
): Promise<void> {
  await client.customer.update({
    where: { id: customerId },
    data: { assignedStaffId: staffId },
  });
}
