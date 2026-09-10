import type { Prisma } from "../../generated/spa-client";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";

type Tx = Prisma.TransactionClient;
type Booking = { id: string; storeId: string; customerId: string; bookingDate: Date };
export type SpaCreditOptions = {
  wallets: { id: string; balance: number }[];
  entitlements: { id: string; name: string; available: number; uses: number }[];
};

// These are existing isolated SPA ledger tables. No legacy wallet is accessed.
export async function readSpaCreditOptions(tx: Tx, b: Booking): Promise<SpaCreditOptions> {
  const wallets = await tx.$queryRaw<{ id: string; balance: Prisma.Decimal }[]>`
    SELECT id, balance FROM "SpaStoredValueWallet"
    WHERE "storeId"=${b.storeId} AND "customerId"=${b.customerId} AND status='ACTIVE'`;
  const day = b.bookingDate.toISOString().slice(0, 10);
  const today = toLocalDateStr();
  const entitlements = await tx.$queryRaw<{ id: string; name: string; available: number; uses: number }[]>`
    SELECT e.id, e."nameSnapshot" AS name,
      (e."remainingUses" - COALESCE((SELECT SUM(u.uses) FROM "SpaEntitlementUse" u
        WHERE u."entitlementId"=e.id AND u."storeId"=e."storeId" AND u.status='RESERVED'),0))::int AS available,
      (SELECT COUNT(*)::int FROM "SpaBookingItem" i WHERE i."bookingId"=${b.id} AND i."storeId"=${b.storeId}) AS uses
    FROM "SpaEntitlement" e
    WHERE e."storeId"=${b.storeId} AND e."customerId"=${b.customerId} AND e.status='ACTIVE'
      AND e."treatmentId" IS NOT NULL
      AND e."startDate"<=${day}::date AND e."startDate"<=${today}::date
      AND (e."expiryDate" IS NULL OR (e."expiryDate">=${day}::date AND e."expiryDate">=${today}::date))
      AND EXISTS (SELECT 1 FROM "SpaBookingItem" i WHERE i."bookingId"=${b.id} AND i."storeId"=${b.storeId})
      AND NOT EXISTS (SELECT 1 FROM "SpaBookingItem" i WHERE i."bookingId"=${b.id} AND i."storeId"=${b.storeId} AND i."treatmentId"<>e."treatmentId")
    ORDER BY e."expiryDate" NULLS LAST, e.id`;
  return { wallets: wallets.map(w => ({ id: w.id, balance: Number(w.balance) })), entitlements: entitlements.filter(e => e.uses > 0 && e.available >= e.uses) };
}

export async function assertNoPriorSpaSettlement(tx: Tx, b: Booking) {
  const rows = await tx.$queryRaw<{ found: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM "SpaPayment" WHERE "storeId"=${b.storeId} AND "bookingId"=${b.id} AND status::text='SUCCESS')
      OR EXISTS(SELECT 1 FROM "SpaEntitlementUse" WHERE "storeId"=${b.storeId} AND "bookingId"=${b.id} AND status IN ('RESERVED','COMPLETED'))
      OR EXISTS(SELECT 1 FROM "SpaStoredValueEntry" WHERE "storeId"=${b.storeId} AND "bookingId"=${b.id} AND "entryType"='DEBIT') AS found`;
  if (rows[0]?.found) throw new AppError("CONFLICT", "此預約已有扣款或保留堂數紀錄，請先核對帳務，避免重複扣款");
}

export async function deductSpaCredit(tx: Tx, b: Booking, method: "STORED_VALUE" | "ENTITLEMENT", sourceId: string, amount: number) {
  if (method === "STORED_VALUE") {
    const wallets = await tx.$queryRaw<{ id: string; balance: Prisma.Decimal }[]>`
      UPDATE "SpaStoredValueWallet" SET balance=balance-${amount}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE id=${sourceId} AND "storeId"=${b.storeId} AND "customerId"=${b.customerId}
        AND status='ACTIVE' AND balance>=${amount} RETURNING id,balance`;
    const wallet = wallets[0];
    if (!wallet) throw new AppError("CONFLICT", "儲值餘額不足或帳戶已停用，請重新選擇付款方式");
    await tx.$executeRaw`INSERT INTO "SpaStoredValueEntry"
      (id,"walletId","storeId","customerId","bookingId","entryType",amount,"balanceAfter",note)
      VALUES (${randomUUID()},${wallet.id},${b.storeId},${b.customerId},${b.id},'DEBIT',${-amount},${wallet.balance},'預約完成結帳')`;
    return { balanceAfter: Number(wallet.balance), uses: null };
  }
  // Row lock also protects against another writer that does not use the store advisory lock.
  await tx.$queryRaw`SELECT id FROM "SpaEntitlement" WHERE id=${sourceId} AND "storeId"=${b.storeId} AND "customerId"=${b.customerId} FOR UPDATE`;
  const option = (await readSpaCreditOptions(tx,b)).entitlements.find(e=>e.id===sourceId);
  if (!option) throw new AppError("CONFLICT", "方案已到期、堂數不足或不適用此服務，請重新選擇");
  const updated = await tx.$queryRaw<{ remainingUses: number }[]>`
    UPDATE "SpaEntitlement" SET "remainingUses"="remainingUses"-${option.uses},
      status=CASE WHEN "remainingUses"=${option.uses} THEN 'EXHAUSTED'::"SpaEntitlementStatus" ELSE status END,
      "updatedAt"=CURRENT_TIMESTAMP
    WHERE id=${sourceId} AND "storeId"=${b.storeId} AND "customerId"=${b.customerId} AND status='ACTIVE'
      AND "remainingUses">=${option.uses} RETURNING "remainingUses"`;
  if (!updated[0]) throw new AppError("CONFLICT", "方案堂數已變更，請重新開啟結帳");
  await tx.$executeRaw`INSERT INTO "SpaEntitlementUse" (id,"storeId","entitlementId","bookingId",uses,status,"completedAt")
    VALUES (${randomUUID()},${b.storeId},${sourceId},${b.id},${option.uses},'COMPLETED',CURRENT_TIMESTAMP)`;
  return { balanceAfter: updated[0].remainingUses, uses: option.uses };
}
