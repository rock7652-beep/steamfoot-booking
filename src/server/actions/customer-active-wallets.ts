"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getStoreFilter } from "@/lib/manager-visibility";
import { sortWalletsByFEFO } from "@/lib/wallet-sort";

export interface ActiveWalletSummary {
  id: string;
  planName: string;
  remainingSessions: number;
  /** YYYY-MM-DD；null = 無期限 */
  expiryDate: string | null;
}

/** 有效補課券摘要（未使用、未過期）。 */
export interface MakeupCreditSummary {
  /** 可用補課券張數（一張抵 1 人 / 1 堂）。 */
  count: number;
  /** 最早到期日 YYYY-MM-DD；null = 全部無期限或無券。 */
  earliestExpiry: string | null;
}

export interface CustomerBookingOptions {
  wallets: ActiveWalletSummary[];
  makeup: MakeupCreditSummary;
}

/**
 * 後台「新增預約」表單用：取得顧客可用方案 + 有效補課券摘要。
 *
 * 目的：讓店長在選定顧客後，UI 能即時顯示「此顧客有可用方案 / 補課資格」並預設綁定，
 *      避免有方案的顧客被誤建成 SINGLE，並讓未到產生的補課券能在新增預約時選用。
 *
 * 權限：booking.create（同 createBooking 入口需要的權限）。
 * Scope：當前 active store；顧客若不在 store 範圍內 → 回空。
 *
 * 只負責「列出」可用 wallets / 補課券摘要，不負責綁定 — 實際 wallet 綁定與
 * 補課券消耗仍由 createBooking server action 處理（保留 server FEFO 為
 * single source of truth；補課券由 createBooking 在 transaction 內自選最早到期 N 張）。
 */
export async function fetchCustomerActiveWalletsForBooking(
  customerId: string,
): Promise<CustomerBookingOptions> {
  await requirePermission("booking.create");

  const empty: CustomerBookingOptions = {
    wallets: [],
    makeup: { count: 0, earliestExpiry: null },
  };
  if (!customerId || typeof customerId !== "string") return empty;

  // 先確認顧客在當前 store filter 範圍內（避免跨店洩漏）
  const user = await (async () => {
    const { requireStaffSession } = await import("@/lib/session");
    return requireStaffSession();
  })();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...getStoreFilter(user) },
    select: { id: true, storeId: true },
  });
  if (!customer) return empty;

  // 補課券有效性與 createBooking 對齊：以「現在」為基準（isUsed=false 且
  // expiredAt 為 null 或 >= now）。不用預約日是因為 createBooking 實際接受
  // 的條件即為 NOW()，避免 UI 顯示可用但 server 拒絕（或反之）。
  const now = new Date();

  const [wallets, makeupCredits] = await Promise.all([
    prisma.customerPlanWallet.findMany({
      where: {
        customerId,
        status: "ACTIVE",
        remainingSessions: { gt: 0 },
      },
      select: {
        id: true,
        remainingSessions: true,
        expiryDate: true,
        createdAt: true,
        plan: { select: { name: true } },
      },
    }),
    prisma.makeupCredit.findMany({
      where: {
        customerId,
        storeId: customer.storeId,
        isUsed: false,
        OR: [{ expiredAt: null }, { expiredAt: { gte: now } }],
      },
      select: { expiredAt: true },
      orderBy: [
        { expiredAt: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
      ],
    }),
  ]);

  // 已依 expiredAt ASC（NULL 最後）排序 → 第一張有期限的即最早到期。
  const earliest = makeupCredits.find((c) => c.expiredAt)?.expiredAt ?? null;

  return {
    wallets: sortWalletsByFEFO(wallets).map((w) => ({
      id: w.id,
      planName: w.plan.name,
      remainingSessions: w.remainingSessions,
      expiryDate: w.expiryDate?.toISOString().slice(0, 10) ?? null,
    })),
    makeup: {
      count: makeupCredits.length,
      earliestExpiry: earliest?.toISOString().slice(0, 10) ?? null,
    },
  };
}
