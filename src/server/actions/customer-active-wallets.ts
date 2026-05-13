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

/**
 * 後台「新增預約」表單用：取得顧客可用方案清單（FEFO 排序）。
 *
 * 目的：讓店長在選定顧客後，UI 能即時顯示「此顧客有可用方案」並預設綁定，
 *      避免有方案的顧客被誤建成 SINGLE。
 *
 * 權限：booking.create（同 createBooking 入口需要的權限）。
 * Scope：當前 active store；顧客若不在 store 範圍內 → 回空陣列。
 *
 * 只負責「列出」可用 wallets，不負責綁定 — 實際 wallet 綁定仍由 createBooking
 * server action 處理（保留 server FEFO 為 single source of truth）。
 */
export async function fetchCustomerActiveWalletsForBooking(
  customerId: string,
): Promise<ActiveWalletSummary[]> {
  await requirePermission("booking.create");

  if (!customerId || typeof customerId !== "string") return [];

  // 先確認顧客在當前 store filter 範圍內（避免跨店洩漏）
  const user = await (async () => {
    const { requireStaffSession } = await import("@/lib/session");
    return requireStaffSession();
  })();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...getStoreFilter(user) },
    select: { id: true },
  });
  if (!customer) return [];

  const wallets = await prisma.customerPlanWallet.findMany({
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
  });

  return sortWalletsByFEFO(wallets).map((w) => ({
    id: w.id,
    planName: w.plan.name,
    remainingSessions: w.remainingSessions,
    expiryDate: w.expiryDate?.toISOString().slice(0, 10) ?? null,
  }));
}
