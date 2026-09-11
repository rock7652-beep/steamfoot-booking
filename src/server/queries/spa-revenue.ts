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
  voided: boolean;
  reversed: boolean;
  revisions: {
    action: string;
    reason: string;
    at: string;
    before: { paymentMethod?: string; transferLast4?: string | null };
    after: { paymentMethod?: string; transferLast4?: string | null };
  }[];
};
export async function getSpaRevenue(
  storeId: string,
  from: string,
  to: string,
  method: string,
  page: number,
  options: { search?: string; kind?: string; status?: string } = {},
) {
  await requireSpaStore(storeId);
  const start = dayRange(from).start,
    end = dayRange(to).end;
  const filter = method ? Prisma.sql`AND method=${method}` : Prisma.empty;
  const kindFilter = ["SERVICE", "PACKAGE", "TOPUP", "REFUND"].includes(
    options.kind ?? "",
  )
    ? Prisma.sql`AND kind=${options.kind}`
    : Prisma.empty;
  const statusFilter =
    options.status === "ALL"
      ? Prisma.empty
      : options.status === "VOIDED"
        ? Prisma.sql`AND voided=true`
        : Prisma.sql`AND voided=false`;
  const search = options.search?.trim().slice(0, 100);
  const searchFilter = search
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Customer" c WHERE c.id=l."customerId" AND c."storeId"=${storeId} AND (strpos(lower(c.name),lower(${search}))>0 OR strpos(c.phone,${search})>0))`
    : Prisma.empty;
  const ledger = Prisma.sql`WITH ledger AS (
 SELECT r.id, 'SERVICE'::text AS kind, "paidAt" AS at, b."customerId", COALESCE((SELECT string_agg(i."treatmentNameSnapshot", '、' ORDER BY i."sortOrder") FROM "SpaBookingItem" i WHERE i."bookingId"=b.id AND i."storeId"=r."storeId"),'服務結帳') AS name, r.amount, r."paymentMethod" AS method, r."transferLast4" AS last4, r.uses, NULL::text AS reason
 FROM "SpaReceipt" r JOIN "SpaBooking" b ON b.id=r."bookingId" AND b."storeId"=r."storeId" WHERE r."storeId"=${storeId}
 UNION ALL
 SELECT id,kind,"createdAt","customerId",name,amount,"paymentMethod","transferLast4",NULL::integer,NULL::text FROM "SpaCreditSale" WHERE "storeId"=${storeId}
 UNION ALL
 SELECT id,'REFUND',"createdAt","customerId",'退款',amount,"paymentMethod","transferLast4",uses,reason FROM "SpaRefund" WHERE "storeId"=${storeId}
 ), marked AS (SELECT l.*,
 EXISTS(SELECT 1 FROM "SpaPaymentRevision" v WHERE v."storeId"=${storeId} AND v.action='VOID' AND ((v.kind=CASE WHEN l.kind='SERVICE' THEN 'RECEIPT' ELSE 'SALE' END AND v."sourceId"=l.id AND l.kind<>'REFUND') OR (l.kind='REFUND' AND v."refundId"=l.id))) AS voided,
 EXISTS(SELECT 1 FROM "SpaRefund" r WHERE r."storeId"=${storeId} AND ((l.kind='SERVICE' AND r."receiptId"=l.id) OR (l.kind IN ('PACKAGE','TOPUP') AND r."saleId"=l.id))) AS reversed
 FROM ledger l WHERE at>=${start} AND at<=${end} ${filter} ${kindFilter} ${searchFilter}),
 filtered AS (SELECT * FROM marked WHERE true ${statusFilter})`;
  const [totals, rows, completed] = await Promise.all([
    spaPrisma.$queryRaw<
      { collected: Prisma.Decimal; refunded: Prisma.Decimal; count: bigint }[]
    >(
      Prisma.sql`${ledger} SELECT COALESCE(SUM(CASE WHEN NOT voided AND kind<>'REFUND' AND method IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT') THEN amount ELSE 0 END),0) AS collected, COALESCE(SUM(CASE WHEN NOT voided AND kind='REFUND' AND method IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT') THEN amount ELSE 0 END),0) AS refunded,COUNT(*) AS count FROM filtered`,
    ),
    spaPrisma.$queryRaw<SpaRevenueRow[]>(
      Prisma.sql`${ledger} SELECT f.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('action',v.action,'reason',v.reason,'at',v."createdAt",'before',v.before,'after',v.after) ORDER BY v."createdAt" DESC) FROM "SpaPaymentRevision" v WHERE v."storeId"=${storeId} AND v.kind=CASE WHEN f.kind='SERVICE' THEN 'RECEIPT' ELSE 'SALE' END AND v."sourceId"=f.id AND f.kind<>'REFUND'),'[]'::jsonb) AS revisions,c.name AS "customerName",c.phone AS "customerPhone" FROM filtered f LEFT JOIN "Customer" c ON c.id=f."customerId" AND c."storeId"=${storeId} ORDER BY f.at DESC,f.kind,f.id LIMIT 30 OFFSET ${(page - 1) * 30}`,
    ),
    spaPrisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS count FROM "SpaReceipt" r WHERE r."storeId"=${storeId} AND r."paidAt">=${start} AND r."paidAt"<=${end} AND NOT EXISTS (SELECT 1 FROM "SpaPaymentRevision" v WHERE v."storeId"=${storeId} AND v.kind='RECEIPT' AND v."sourceId"=r.id AND v.action='VOID')`,
    ),
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
    completed: Number(completed[0]?.count ?? 0),
  };
}
