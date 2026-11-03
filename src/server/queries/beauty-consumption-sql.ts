import { Prisma } from "@prisma/client";
import { dayRange } from "@/lib/date-utils";
import type { ConsumptionFilters } from "@/lib/customer-consumption";

/** Beauty ledger and payments only. Identity visibility is resolved on the core connection. */
export function beautyConsumptionSource(storeId: string, filters: ConsumptionFilters, now: Date) {
  const {start} = dayRange(filters.startDate);
  const end = new Date(Math.min(dayRange(filters.endDate).end.getTime(), now.getTime()));
  const plan = filters.planId;
  return Prisma.sql`
    bookings AS (
      SELECT b.*, c."planId" plan_id,
        GREATEST(0, -COALESCE(l.delta,0))::float8 used,
        GREATEST(0,COALESCE(p.money,0))::float8 money
      FROM "BeautyAppointment" b JOIN customers x ON x.id=b."customerId"
      LEFT JOIN "BeautyCard" c ON c.id=b."cardId" AND c."storeId"=b."storeId"
      LEFT JOIN LATERAL (
        SELECT sum(l.delta) delta FROM "BeautyLedger" l
        WHERE l."storeId"=${storeId} AND l."appointmentId"=b.id AND l."cardId"=b."cardId"
          AND l.kind IN ('RESERVE','CORRECTION')
      ) l ON true
      LEFT JOIN LATERAL (
        SELECT sum(p.amount) money FROM "BeautyPayment" p
        WHERE p."storeId"=${storeId} AND p."appointmentId"=b.id AND p.kind IN ('SALE','REFUND')
      ) p ON true
      WHERE b."storeId"=${storeId} AND b."startsAt" BETWEEN ${start} AND ${end}
        AND (${plan}='' OR c."planId"=${plan} OR (${plan}='__single__' AND b."cardId" IS NULL))
        AND (${filters.includeAbsent} OR b.status NOT IN ('NO_SHOW','CANCELLED'))
    ), usage AS (
      SELECT "customerId",count(*)::int count,
        0::float8 sessions,0::float8 grids,0::float8 points,
        sum(CASE WHEN "cardId" IS NULL THEN money ELSE 0 END)::float8 amount
      FROM bookings WHERE
        ("cardId" IS NOT NULL AND debit AND used>0 AND status IN ('COMPLETED','CANCELLED','NO_SHOW'))
        OR ("cardId" IS NULL AND money>0 AND (status='COMPLETED' OR (debit AND status IN ('CANCELLED','NO_SHOW'))))
      GROUP BY "customerId"
    ), receipts AS (
      SELECT x.id AS "customerId",sum(p.amount)::float8 paid
      FROM "BeautyPayment" p
      LEFT JOIN "BeautyCard" c ON c.id=p."cardId" AND c."storeId"=p."storeId"
      LEFT JOIN "BeautyAppointment" b ON b.id=p."appointmentId" AND b."storeId"=p."storeId"
      JOIN customers x ON x.id=CASE WHEN p."appointmentId" IS NOT NULL THEN b."customerId" ELSE c."customerId" END
      WHERE p."storeId"=${storeId} AND p.kind IN ('SALE','REFUND') AND p."createdAt" BETWEEN ${start} AND ${end}
        AND (${plan}='' OR c."planId"=${plan} OR (${plan}='__single__' AND p."cardId" IS NULL AND b.id IS NOT NULL))
      GROUP BY x.id
    ), balances AS (
      SELECT x.id AS "customerId",string_agg(c.name || CASE WHEN cardinality(c."memberIds")>1 THEN '（共用）' ELSE '' END
        || '：剩餘 ' || c.remaining || ' 次／到期 ' || to_char(c."expiresAt" AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD'),
        '；' ORDER BY c."expiresAt",c.id) balances
      FROM "BeautyCard" c JOIN customers x ON x.id=ANY(c."memberIds")
      WHERE c."storeId"=${storeId} AND c."closedAt" IS NULL AND c."expiresAt">=${now}
        AND (${plan}='' OR c."planId"=${plan}) GROUP BY x.id
    )`;
}
