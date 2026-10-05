import "server-only";
import { prisma } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { requireStaffSession } from "@/lib/session";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError } from "@/lib/errors";
import type { UserRole, Prisma } from "@prisma/client";

// Protect historical payments even when the inventory feature has been disabled.
export const inventoryPurchaseCashbookWhere: Prisma.CashbookEntryWhereInput = {
 OR: [{ type: "EXPENSE", id: { startsWith: "inventory:" } }, { category: "進銷存進貨" }],
};
type Reader = { role: UserRole; staffId: string | null };
export async function inventoryCashbookReadFilter(user: Reader): Promise<Prisma.CashbookEntryWhereInput> {
 return await checkPermission(user.role,user.staffId,"inventory.cost.read") ? {} : { AND: [
  { OR: [{ type: { not: "EXPENSE" } }, { id: { not: { startsWith: "inventory:" } } }] },
  { OR: [{ category: null }, { category: { not: "進銷存進貨" } }] },
 ] };
}
// A partial ledger cannot produce a trustworthy balance. Restrict full financial
// totals/closing instead of subtracting hidden purchases or changing saved accounting.
export async function canReadInventoryFinance(storeId: string | null | undefined, reader?: Reader): Promise<boolean> {
 const user=reader ?? await requireStaffSession();
 if(await checkPermission(user.role,user.staffId,"inventory.cost.read")) return true;
 if(!storeId) return false;
 if(await hasStoreFeature(storeId,FEATURES.INVENTORY)) return false;
 return !await prisma.cashbookEntry.findFirst({where:{storeId,AND:[inventoryPurchaseCashbookWhere]},select:{id:true}});
}
export async function requireInventoryFinanceAccess(storeId: string | null | undefined, reader?: Reader): Promise<void> {
 if(!await canReadInventoryFinance(storeId,reader)) throw new AppError("FORBIDDEN","完整財務彙總與結帳需有查看進貨成本的權限");
}
