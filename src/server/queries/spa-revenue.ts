import "server-only";
import { Prisma } from "../../../generated/spa-client";
import { spaPrisma } from "@/lib/spa-db";
import { requireSpaStore } from "@/lib/industry-module-server";
import { dayRange } from "@/lib/date-utils";
import { isSpaExternalPayment } from "@/lib/spa-payment-methods";

export type SpaRevenueRow = {
  id: string;
  kind: string;
  at: Date;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  name: string;
  amount: Prisma.Decimal;
  method: string;
  last4: string | null;
  uses: number | null;
  reason: string | null;
};
export async function getSpaRevenue(
  storeId: string,
  from: string,
  to: string,
  method: string,
  page: number,
) {
  await requireSpaStore(storeId);
  const start = dayRange(from).start,
    end = dayRange(to).end;
  const filter = method ? Prisma.sql`AND method=${method}` : Prisma.empty;
  const ledger = Prisma.sql`WITH ledger AS (
 SELECT r.id, 'SERVICE'::text AS kind, "paidAt" AS at, b."customerId", '服務結帳'::text AS name, r.amount, r."paymentMethod" AS method, r."transferLast4" AS last4, r.uses, NULL::text AS reason
 FROM "SpaReceipt" r JOIN "SpaBooking" b ON b.id=r."bookingId" AND b."storeId"=r."storeId" WHERE r."storeId"=${storeId}
 UNION ALL
 SELECT id,kind,"createdAt","customerId",name,amount,"paymentMethod","transferLast4",NULL::integer,NULL::text FROM "SpaCreditSale" WHERE "storeId"=${storeId}
 UNION ALL
 SELECT id,'REFUND',"createdAt","customerId",'退款',amount,"paymentMethod","transferLast4",uses,reason FROM "SpaRefund" WHERE "storeId"=${storeId}
 ), filtered AS (SELECT * FROM ledger WHERE at>=${start} AND at<=${end} ${filter})`;
  const [totals, rows, completed] = await Promise.all([
    spaPrisma.$queryRaw<
      { collected: Prisma.Decimal; refunded: Prisma.Decimal; count: bigint }[]
    >(
      Prisma.sql`${ledger} SELECT COALESCE(SUM(CASE WHEN kind<>'REFUND' AND method IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT') THEN amount ELSE 0 END),0) AS collected, COALESCE(SUM(CASE WHEN kind='REFUND' AND method IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT') THEN amount ELSE 0 END),0) AS refunded,COUNT(*) AS count FROM filtered`,
    ),
    spaPrisma.$queryRaw<SpaRevenueRow[]>(
      Prisma.sql`${ledger} SELECT f.*,c.name AS "customerName",c.phone AS "customerPhone" FROM filtered f LEFT JOIN "Customer" c ON c.id=f."customerId" AND c."storeId"=${storeId} ORDER BY f.at DESC,f.kind,f.id LIMIT 30 OFFSET ${(page - 1) * 30}`,
    ),
    spaPrisma.spaReceipt.count({
      where: { storeId, paidAt: { gte: start, lte: end } },
    }),
  ]);
  return {
    rows: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      external: isSpaExternalPayment(r.method),
    })),
    collected: Number(totals[0].collected),
    refunded: Number(totals[0].refunded),
    count: Number(totals[0].count),
    completed,
  };
}
