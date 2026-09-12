"use server";
import { getSpaCustomerProfile } from "./spa-customer-profile";
import { spaResourceStore } from "./spa-resources";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { spaCustomerSummaries } from "@/server/queries/spa-customer-summary";
import { handleActionError } from "@/lib/errors";

export async function getSpaCustomerDrawer(customerId: string) {
  try {
    const user = await requirePermission("customer.read");
    const storeId = await spaResourceStore("customer.read");
    const profile = await getSpaCustomerProfile(customerId);
    if (!profile.success) return profile;
    const [canReadBookings, canReadWallet, canReadTransactions] =
      await Promise.all([
        checkPermission(user.role, user.staffId, "booking.read"),
        checkPermission(user.role, user.staffId, "wallet.read"),
        checkPermission(user.role, user.staffId, "transaction.read"),
      ]);
    const canReadAccounts = canReadWallet && canReadTransactions;
    const summaries = await spaCustomerSummaries(
      storeId,
      [profile.customer.id],
      canReadBookings,
      canReadAccounts,
    );
    const visit = summaries.visits.find((v) => v.customerId === customerId);
    return {
      success: true as const,
      profile,
      customer: {
        ...profile.customer,
        lastVisit: visit?.lastVisit ?? null,
        nextVisit: visit?.nextVisit ?? null,
        packages: summaries.credits.map((p) => ({
          name: p.name,
          available: p.available,
          expiry: p.expiry,
        })),
        balance: canReadAccounts
          ? Number(summaries.wallets[0]?.balance ?? 0)
          : null,
      },
      permissions: {
        canReadBookings,
        canReadAccounts,
        canSell: false,
        canRefund: false,
        canEdit: false,
        canCreate: false,
        canBook: false,
      },
    };
  } catch (error) {
    const result = handleActionError(error);
    return {
      success: false as const,
      error: result.success ? "顧客資料讀取失敗" : result.error,
    };
  }
}
