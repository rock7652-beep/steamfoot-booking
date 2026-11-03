import { beautyConsumptionSource } from "./beauty-consumption-sql";
import { Prisma } from "@prisma/client";
import { dayRange, parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { CONSUMPTION_EXPORT_LIMIT, CONSUMPTION_PAGE_SIZE, type ConsumptionFilters } from "@/lib/customer-consumption";

/** All identifiers are fixed here; user input is always a bound SQL value. */
const columns = { count: Prisma.sql`count`, sessions: Prisma.sql`sessions`, grids: Prisma.sql`grids`, points: Prisma.sql`points`, amount: Prisma.sql`amount`, paid: Prisma.sql`paid` };

export function customerConsumptionSql(storeId: string, module: "course" | "steamfoot" | "beauty", staffScope: string | null, filters: ConsumptionFilters, exporting = false, now = new Date(), beautyCustomers?: Array<{id:string;name:string;phone:string;assignedStaffName:string|null}>) {
  const { start } = dayRange(filters.startDate), { end } = dayRange(filters.endDate);
  const dateStart = parseTaiwanDateToDbDate(filters.startDate), dateEnd = parseTaiwanDateToDbDate(filters.endDate);
  const plan = filters.planId;
  const course = module === "course";
  const source = module === "beauty" ? beautyConsumptionSource(storeId, filters, now) : course ? Prisma.sql`
    bookings AS (
      SELECT b.*, s."startsAt" service_at, c."planId" plan_id, c.unit,
        COALESCE(p.amount,0)::float8 money,
        (b.status IN ('ATTENDED','NO_SHOW') OR b."absenceKind"='GROUP_LEAVE_FORFEITED') debited
      FROM "CourseBooking" b
      JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
      LEFT JOIN "CoursePointCard" c ON c.id=b."cardId" AND c."storeId"=b."storeId"
      LEFT JOIN LATERAL (SELECT sum(p.amount) amount FROM "CourseTrialPayment" p
        WHERE p."storeId"=${storeId} AND p."bookingId"=b.id AND p.status='SUCCESS') p ON true
      JOIN customers x ON x.id=b."customerId"
      WHERE b."storeId"=${storeId} AND s."cancelledAt" IS NULL
        AND (${plan}='' OR c."planId"=${plan} OR (${plan}='__trial__' AND b."bookingKind"='TRIAL'))
        AND (${filters.includeAbsent} OR (b.status<>'NO_SHOW' AND COALESCE(b."absenceKind",'')<>'GROUP_LEAVE_FORFEITED'))
    ), usage AS (
      SELECT "customerId", count(*)::int count,
        sum(CASE WHEN debited AND unit='SESSION' THEN "pointCost" ELSE 0 END)::float8 sessions,
        sum(CASE WHEN debited AND unit='GRID' THEN "pointCost" ELSE 0 END)::float8 grids,
        sum(CASE WHEN debited AND unit='POINT' THEN "pointCost" ELSE 0 END)::float8 points,
        sum(money)::float8 amount
      FROM bookings WHERE service_at BETWEEN ${start} AND ${end}
        AND ((debited AND "cardId" IS NOT NULL AND "pointCost">0) OR (money>0 AND status IN ('ATTENDED','NO_SHOW')))
      GROUP BY "customerId"
    ), receipts AS (
      SELECT "customerId", sum(amount)::float8 paid FROM (
        SELECT p."customerId", p.price amount FROM "CoursePurchase" p JOIN customers x ON x.id=p."customerId"
        WHERE p."storeId"=${storeId} AND p.status IN ('CONFIRMED','REFUNDED') AND p."voidedAt" IS NULL
          AND p."confirmedAt" BETWEEN ${start} AND ${end} AND (${plan}='' OR p."planId"=${plan})
        UNION ALL
        SELECT b."customerId", p.amount FROM "CourseTrialPayment" p
        JOIN "CourseBooking" b ON b.id=p."bookingId" AND b."storeId"=p."storeId" JOIN customers x ON x.id=b."customerId"
        WHERE p."storeId"=${storeId} AND p.status='SUCCESS' AND p."createdAt" BETWEEN ${start} AND ${end}
          AND (${plan}='' OR ${plan}='__trial__')
        UNION ALL
        SELECT p."customerId", -r.amount FROM "CoursePurchaseRefund" r
        JOIN "CoursePurchase" p ON p.id=r."purchaseId" AND p."storeId"=r."storeId" JOIN customers x ON x.id=p."customerId"
        WHERE r."storeId"=${storeId} AND r."createdAt" BETWEEN ${start} AND ${end} AND (${plan}='' OR p."planId"=${plan})
      ) r GROUP BY "customerId"
    ), balances AS (
      SELECT m."customerId", string_agg(c."nameSnapshot" || CASE WHEN (SELECT count(*) FROM "CourseCardMember" mm WHERE mm."cardId"=c.id AND mm."storeId"=${storeId})>1 THEN '（共卡）' ELSE '' END
        || '：剩餘 ' || c.remaining || CASE c.unit WHEN 'SESSION' THEN ' 堂' WHEN 'GRID' THEN ' 格' ELSE ' 點' END
        || '／到期 ' || to_char(c."expiresAt" AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD'), '；' ORDER BY c."expiresAt",c.id) balances
      FROM "CoursePointCard" c JOIN "CourseCardMember" m ON m."cardId"=c.id AND m."storeId"=c."storeId" JOIN customers x ON x.id=m."customerId"
      WHERE c."storeId"=${storeId} AND c."closedAt" IS NULL AND c."expiresAt">${now} AND (${plan}='' OR c."planId"=${plan})
      GROUP BY m."customerId"
    )` : Prisma.sql`
    valid_transactions AS (
      SELECT t.*, COALESCE(t."planId",w."planId",b."servicePlanId",original."planId",original_wallet."planId",'__unassigned__') plan_id
      FROM "Transaction" t JOIN customers x ON x.id=t."customerId"
      LEFT JOIN "CustomerPlanWallet" w ON w.id=t."customerPlanWalletId" AND w."storeId"=t."storeId"
      LEFT JOIN "Booking" b ON b.id=t."bookingId" AND b."storeId"=t."storeId"
      LEFT JOIN "Transaction" original ON original.id=t."refundOfTransactionId" AND original."storeId"=t."storeId"
      LEFT JOIN "CustomerPlanWallet" original_wallet ON original_wallet.id=original."customerPlanWalletId" AND original_wallet."storeId"=t."storeId"
      WHERE t."storeId"=${storeId} AND t.status IN ('SUCCESS','REFUNDED')
        AND t."paymentStatus" IN ('SUCCESS','CONFIRMED') AND t."paymentMethod"<>'UNPAID'
        AND t."transactionType" IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE','SUPPLEMENT','REFUND')
    ), service_money AS (
      SELECT t."bookingId",t."customerId", sum(GREATEST(0,t.amount-COALESCE(r.amount,t."refundAmount",0)))::float8 money
      FROM valid_transactions t LEFT JOIN LATERAL (
        SELECT sum(abs(r.amount)) amount FROM "Transaction" r WHERE r."storeId"=${storeId}
          AND r."refundOfTransactionId"=t.id AND r.status='SUCCESS' AND r."transactionType"='REFUND'
      ) r ON true
      WHERE t."transactionType" IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','SUPPLEMENT') AND (${plan}='' OR t.plan_id=${plan})
      GROUP BY t."bookingId",t."customerId"
    ), deductions AS (
      SELECT s."bookingId",count(*)::int sessions FROM "WalletSession" s
      JOIN "CustomerPlanWallet" w ON w.id=s."walletId" AND w."storeId"=${storeId}
      WHERE s.status='COMPLETED' AND (${plan}='' OR w."planId"=${plan}) GROUP BY s."bookingId"
    ), service_usage AS (
      SELECT b."customerId",count(*)::int count,sum(COALESCE(d.sessions,0))::float8 sessions,
        0::float8 grids,0::float8 points,sum(COALESCE(m.money,0))::float8 amount
      FROM "Booking" b JOIN customers x ON x.id=b."customerId"
      LEFT JOIN "CustomerPlanWallet" w ON w.id=b."customerPlanWalletId" AND w."storeId"=b."storeId"
      LEFT JOIN deductions d ON d."bookingId"=b.id LEFT JOIN service_money m ON m."bookingId"=b.id AND m."customerId"=b."customerId"
      WHERE b."storeId"=${storeId} AND b."bookingDate" BETWEEN ${dateStart} AND ${dateEnd}
        AND NOT EXISTS (SELECT 1 FROM "BookingParticipantGroup" g WHERE g."bookingId"=b.id AND g."storeId"=${storeId})
        AND b."bookingStatus" IN ('COMPLETED','NO_SHOW')
        AND (${filters.includeAbsent} OR b."bookingStatus"<>'NO_SHOW')
        AND (${plan}='' OR COALESCE(w."planId",b."servicePlanId",'__unassigned__')=${plan})
        AND (COALESCE(d.sessions,0)>0 OR COALESCE(m.money,0)>0)
      GROUP BY b."customerId"
      UNION ALL
      SELECT p."customerId",count(*)::int count,
        sum(CASE WHEN ws.status='COMPLETED' THEN 1 ELSE 0 END)::float8 sessions,
        0::float8 grids,0::float8 points,sum(COALESCE(m.money,0))::float8 amount
      FROM "BookingParticipant" p JOIN customers x ON x.id=p."customerId"
      JOIN "BookingParticipantGroup" g ON g.id=p."groupId" AND g."storeId"=p."storeId"
      JOIN "Booking" b ON b.id=g."bookingId" AND b."storeId"=g."storeId"
      LEFT JOIN "WalletSession" ws ON ws.id=p."walletSessionId"
      LEFT JOIN "CustomerPlanWallet" w ON w.id=ws."walletId" AND w."storeId"=p."storeId" AND w."customerId"=p."customerId"
      LEFT JOIN "Transaction" t ON t.id=p."collectionTransactionId" AND t."storeId"=p."storeId"
      LEFT JOIN service_money m ON m."bookingId"=b.id AND m."customerId"=p."customerId"
      WHERE p."storeId"=${storeId} AND b."bookingDate" BETWEEN ${dateStart} AND ${dateEnd}
        AND p.status IN ('COMPLETED','NO_SHOW') AND (${filters.includeAbsent} OR p.status<>'NO_SHOW')
        AND (${plan}='' OR COALESCE(w."planId",t."planId",b."servicePlanId",'__unassigned__')=${plan})
        AND ((ws.status='COMPLETED' AND w.id IS NOT NULL) OR COALESCE(m.money,0)>0)
      GROUP BY p."customerId"
      UNION ALL
      SELECT t."customerId",count(*)::int count,0::float8 sessions,0::float8 grids,0::float8 points,
        sum(GREATEST(0,t.amount-COALESCE(r.amount,t."refundAmount",0)))::float8 amount
      FROM valid_transactions t LEFT JOIN LATERAL (
        SELECT sum(abs(r.amount)) amount FROM "Transaction" r WHERE r."storeId"=${storeId}
          AND r."refundOfTransactionId"=t.id AND r.status='SUCCESS' AND r."transactionType"='REFUND'
      ) r ON true
      WHERE t."bookingId" IS NULL AND t."transactionType" IN ('TRIAL_PURCHASE','SINGLE_PURCHASE')
        AND COALESCE(t."paidAt",t."createdAt") BETWEEN ${start} AND ${end}
        AND GREATEST(0,t.amount-COALESCE(r.amount,t."refundAmount",0))>0 AND (${plan}='' OR t.plan_id=${plan})
      GROUP BY t."customerId"
    ), usage AS (
      SELECT "customerId",sum(count)::int count,sum(sessions)::float8 sessions,
        sum(grids)::float8 grids,sum(points)::float8 points,sum(amount)::float8 amount FROM service_usage GROUP BY "customerId"
    ), receipts AS (
      SELECT "customerId",sum(CASE WHEN "transactionType"='REFUND' THEN -abs(amount) ELSE amount END)::float8 paid
      FROM valid_transactions WHERE COALESCE("paidAt","createdAt") BETWEEN ${start} AND ${end}
        AND (${plan}='' OR plan_id=${plan}) GROUP BY "customerId"
    ), balances AS (
      SELECT w."customerId",string_agg(p.name || '：剩餘 ' || w."remainingSessions" || ' 堂／到期 '
        || COALESCE(to_char(w."expiryDate",'YYYY-MM-DD'),'無期限'),'；' ORDER BY w."expiryDate",w.id) balances
      FROM "CustomerPlanWallet" w JOIN "ServicePlan" p ON p.id=w."planId" AND p."storeId"=w."storeId" JOIN customers x ON x.id=w."customerId"
      WHERE w."storeId"=${storeId} AND w.status IN ('ACTIVE','USED_UP')
        AND (w."expiryDate" IS NULL OR w."expiryDate">=${parseTaiwanDateToDbDate(toLocalDateStr(now))}) AND (${plan}='' OR w."planId"=${plan})
      GROUP BY w."customerId"
    )`;
  const conditions = Object.entries(filters.ranges).flatMap(([key, range]) => {
    const column = columns[key as keyof typeof columns];
    return [range.min !== undefined ? Prisma.sql`${column}>=${range.min}` : null,
      range.max !== undefined ? Prisma.sql`${column}<=${range.max}` : null].filter((item): item is Prisma.Sql => item !== null);
  });
  const selectedCustomers = module === "beauty" ? Prisma.sql`EXISTS (SELECT 1 FROM "BeautyCard" c WHERE c."storeId"=${storeId} AND x.id=ANY(c."memberIds") AND c."planId"=${plan})` : course ? Prisma.sql`EXISTS (SELECT 1 FROM "CoursePointCard" c JOIN "CourseCardMember" m ON m."cardId"=c.id AND m."storeId"=c."storeId" WHERE c."storeId"=${storeId} AND m."customerId"=x.id AND c."planId"=${plan})`
    : Prisma.sql`EXISTS (SELECT 1 FROM "CustomerPlanWallet" w WHERE w."storeId"=${storeId} AND w."customerId"=x.id AND w."planId"=${plan})`;
  const direction = filters.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return Prisma.sql`
    WITH customers AS (${module === "beauty" ? beautyConsumptionCustomers(beautyCustomers) : customerConsumptionCustomersSql(storeId, staffScope, filters)}
    ), ${source}, summary AS (
      SELECT x.*,COALESCE(u.count,0)::int count, COALESCE(u.sessions,0)::float8 sessions,
        COALESCE(u.grids,0)::float8 grids, COALESCE(u.points,0)::float8 points,
        COALESCE(u.amount,0)::float8 amount,COALESCE(r.paid,0)::float8 paid,COALESCE(b.balances,'') balances
      FROM customers x LEFT JOIN usage u ON u."customerId"=x.id LEFT JOIN receipts r ON r."customerId"=x.id LEFT JOIN balances b ON b."customerId"=x.id
      WHERE (${plan}='' OR u."customerId" IS NOT NULL OR r."customerId" IS NOT NULL OR ${selectedCustomers})
    ), filtered AS (
      SELECT * FROM summary ${conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty}
    ), ranked AS (
      SELECT *,row_number() OVER (ORDER BY ${columns[filters.sort]} ${direction},name ASC,id ASC) position FROM filtered
    ), selected AS (
      SELECT * FROM ranked ORDER BY position ${filters.top ? Prisma.sql`LIMIT ${filters.top}` : Prisma.empty}
    ), totals AS (SELECT count(*)::int total FROM selected), paged AS (
      SELECT * FROM selected ORDER BY position
      LIMIT ${exporting ? CONSUMPTION_EXPORT_LIMIT + 1 : CONSUMPTION_PAGE_SIZE}
      OFFSET ${exporting ? Prisma.sql`0` : Prisma.sql`LEAST(${(filters.page - 1) * CONSUMPTION_PAGE_SIZE},GREATEST(0,(SELECT total-1 FROM totals)/${CONSUMPTION_PAGE_SIZE})*${CONSUMPTION_PAGE_SIZE})`}
    )
    SELECT total,(SELECT count(*)::int FROM filtered) matched,
      ${exporting ? Prisma.sql`1` : Prisma.sql`LEAST(${filters.page},GREATEST(1,(total+${CONSUMPTION_PAGE_SIZE - 1})/${CONSUMPTION_PAGE_SIZE}))`}::int page,
      COALESCE((SELECT jsonb_agg(to_jsonb(p)-'position' ORDER BY position) FROM paged p),'[]'::jsonb) rows FROM totals`;
}

/** Shared identity query stays on the core connection; the Beauty role needs no User/Staff grants. */
export function customerConsumptionCustomersSql(storeId: string, staffScope: string | null, filters: ConsumptionFilters, cutoff?: Date) {
  const end = new Date(Math.min(dayRange(filters.endDate).end.getTime(),cutoff?.getTime()??Infinity));
  return Prisma.sql`
      SELECT c.id,c.name,c.phone,s."displayName" AS "assignedStaffName"
      FROM "Customer" c LEFT JOIN "User" u ON u.id=c."userId"
      LEFT JOIN "Staff" s ON s.id=c."assignedStaffId" AND s."storeId"=c."storeId"
      WHERE c."storeId"=${storeId} AND c."mergedIntoCustomerId" IS NULL AND (u.status IS NULL OR u.status<>'SUSPENDED')
        AND c."createdAt"<=${end} ${staffScope ? Prisma.sql`AND c."assignedStaffId"=${staffScope}` : Prisma.empty}
        AND (${filters.staffId}='' OR (${filters.staffId}='__unassigned__' AND s.id IS NULL) OR s.id=${filters.staffId})
        AND (${filters.q}='' OR strpos(lower(c.name),lower(${filters.q}))>0 OR strpos(c.phone,${filters.q})>0)
`;
}
function beautyConsumptionCustomers(rows?: Array<{id:string;name:string;phone:string;assignedStaffName:string|null}>) {
  if (!rows) throw new Error("Beauty consumption requires authorized core customer scope");
  return Prisma.sql`SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS c(id text,name text,phone text,"assignedStaffName" text)`;
}
