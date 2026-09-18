import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr, addTaiwanDuration, bookingDateToday } from "@/lib/date-utils";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { computeLiveTotalsForOpenSession } from "@/server/queries/cash-drawer";

export function courseCustomerStaffScope(user: { role: string; staffId: string | null }, storeId: string): string | null {
  const where = getManagerCustomerWhere(user.role, user.staffId, storeId);
  return typeof where.assignedStaffId === "string" ? where.assignedStaffId : null;
}

/** One bounded aggregate row; no session roster is transported to the home. */
export async function getCourseHomeToday(storeId: string, date: string) {
  const { start, end } = dayRange(date);
  const [row] = await prisma.$queryRaw<Array<{ sessions: number; bookings: number; people: number; attended: number }>>(Prisma.sql`
    SELECT count(DISTINCT s.id)::int sessions, count(b.id)::int bookings,
      count(DISTINCT b."customerId")::int people,
      count(b.id) FILTER (WHERE b.status='ATTENDED')::int attended
    FROM "CourseSession" s LEFT JOIN "CourseBooking" b ON b."sessionId"=s.id AND b."storeId"=s."storeId" AND b.status<>'CANCELLED'
    WHERE s."storeId"=${storeId} AND s."cancelledAt" IS NULL AND s."startsAt" BETWEEN ${start} AND ${end}`);
  return row;
}

/** Matches the report's event-time ledger, including a receipt subsequently voided. */
export async function getCourseReceiptTotals(storeId: string, from: string, to: string) {
  const start = dayRange(from).start, end = dayRange(to).end;
  const [row] = await prisma.$queryRaw<Array<{ purchases: number; purchaseCount: number; trial: number; refunds: number; voids: number }>>(Prisma.sql`
    SELECT
      (SELECT COALESCE(sum(price),0)::float8 FROM "CoursePurchase" WHERE "storeId"=${storeId} AND status IN ('CONFIRMED','REFUNDED') AND "confirmedAt" BETWEEN ${start} AND ${end}) purchases,
      (SELECT count(*)::int FROM "CoursePurchase" WHERE "storeId"=${storeId} AND status IN ('CONFIRMED','REFUNDED') AND "confirmedAt" BETWEEN ${start} AND ${end}) "purchaseCount",
      (SELECT COALESCE(sum(amount),0)::float8 FROM "CourseTrialPayment" WHERE "storeId"=${storeId} AND "createdAt" BETWEEN ${start} AND ${end}) trial,
      (SELECT COALESCE(sum(amount),0)::float8 FROM "CoursePurchaseRefund" WHERE "storeId"=${storeId} AND "createdAt" BETWEEN ${start} AND ${end}) refunds,
      (SELECT COALESCE(sum(amount),0)::float8 FROM "CourseTrialPayment" WHERE "storeId"=${storeId} AND "voidedAt" BETWEEN ${start} AND ${end}) voids`);
  return { ...row, gross: row.purchases + row.trial, net: row.purchases + row.trial - row.refunds - row.voids };
}

export async function getCourseHomeCustomers(storeId: string, staffId: string | null, scope: string | null) {
  // Intentionally uncached: count-only, current authorization on every request; no stale assignment/merge cache.
  const [row] = await prisma.$queryRaw<Array<{ total: number; mine: number }>>(Prisma.sql`
    SELECT count(*)::int total, count(*) FILTER (WHERE "assignedStaffId"=${staffId})::int mine
    FROM "Customer" WHERE "storeId"=${storeId} AND "mergedIntoCustomerId" IS NULL
    ${scope ? Prisma.sql`AND "assignedStaffId"=${scope}` : Prisma.empty}`);
  return { total: scope ? null : row.total, mine: staffId ? row.mine : null };
}

export const COURSE_CARE_LABELS = { birthday: "本月生日", trial: "體驗未購買", inactive: "久未上課", expiring: "方案快到期", low: "額度快用完" } as const;
export type CourseCareKind = keyof typeof COURSE_CARE_LABELS;
export function isCourseCareKind(value?: string): value is CourseCareKind { return !!value && Object.hasOwn(COURSE_CARE_LABELS, value); }

/** Same predicates as course care detail; each card evaluated independently, then customers deduplicated. */
export async function getCourseCareCounts(storeId: string, scope: string | null, now = new Date()) {
  const date = toLocalDateStr(now), month = Number(date.slice(5, 7));
  const expiry = dayRange(addTaiwanDuration(date, 14, "DAY")).end;
  const inactive = dayRange(addTaiwanDuration(date, -30, "DAY")).start;
  const [row] = await prisma.$queryRaw<Array<Record<CourseCareKind, number>>>(Prisma.sql`
    WITH held AS (
      SELECT "cardId", sum("pointCost") amount FROM "CourseBooking" WHERE "storeId"=${storeId} AND status='RESERVED' GROUP BY "cardId"
    ), cards AS (
      SELECT m."customerId", c.remaining, c."expiresAt",
        p."lowBalanceEnabled" AND p."lowBalanceThreshold" IS NOT NULL AND GREATEST(0,c.remaining-COALESCE(h.amount,0))<=p."lowBalanceThreshold" low
      FROM "CoursePointCard" c JOIN "CoursePointPlan" p ON p.id=c."planId" AND p."storeId"=c."storeId"
      JOIN "CourseCardMember" m ON m."cardId"=c.id AND m."storeId"=c."storeId"
      LEFT JOIN held h ON h."cardId"=c.id
      WHERE c."storeId"=${storeId} AND c."closedAt" IS NULL AND c."expiresAt">${now}
    ), visits AS (
      SELECT b."customerId", max(s."startsAt") last FROM "CourseBooking" b
      JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
      WHERE b."storeId"=${storeId} AND b.status='ATTENDED' GROUP BY b."customerId"
    )
    SELECT count(*) FILTER (WHERE EXTRACT(MONTH FROM c.birthday)=${month})::int birthday,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM cards k WHERE k."customerId"=c.id AND k.low))::int low,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM cards k WHERE k."customerId"=c.id AND k.remaining>0 AND k."expiresAt"<=${expiry}))::int expiring,
      count(*) FILTER (WHERE v.last<${inactive} AND EXISTS (SELECT 1 FROM cards k WHERE k."customerId"=c.id AND k.remaining>0))::int inactive,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "CourseTrialPayment" p JOIN "CourseBooking" b ON b.id=p."bookingId" AND b."storeId"=p."storeId" WHERE p."storeId"=${storeId} AND p.status='SUCCESS' AND b."bookingKind"='TRIAL' AND b.status<>'CANCELLED' AND b."customerId"=c.id)
        AND NOT EXISTS (SELECT 1 FROM "CoursePurchase" o WHERE o."storeId"=${storeId} AND o."customerId"=c.id AND o.status IN ('CONFIRMED','REFUNDED'))
        AND NOT EXISTS (SELECT 1 FROM cards k WHERE k."customerId"=c.id AND k.remaining>0))::int trial
    FROM "Customer" c LEFT JOIN "User" u ON u.id=c."userId" LEFT JOIN visits v ON v."customerId"=c.id
    WHERE c."storeId"=${storeId} AND c."mergedIntoCustomerId" IS NULL AND (u.status IS NULL OR u.status<>'SUSPENDED')
    ${scope ? Prisma.sql`AND c."assignedStaffId"=${scope}` : Prisma.empty}`);
  return row;
}

export async function getCourseHomeCash(storeId: string) {
  const session = await prisma.cashDrawerSession.findFirst({ where: { storeId, businessDate: { lte: bookingDateToday() } }, orderBy: { businessDate: "desc" } });
  if (!session) return { state: "EMPTY" as const };
  if (session.businessDate.valueOf() !== bookingDateToday().valueOf()) return { state: session.status === "OPEN" ? "PREVIOUS_OPEN" as const : "NOT_OPEN" as const };
  const closed = session.status === "CLOSED";
  const live = closed ? null : await computeLiveTotalsForOpenSession(session);
  return { state: closed ? "CLOSED" as const : "OPEN" as const,
    expected: (closed ? session.expectedClosingCash : live?.expectedClosingCash)?.toNumber() ?? null,
    actual: session.closingActualCash?.toNumber() ?? null,
    difference: session.closingDifference?.toNumber() ?? null,
    openingActual: session.openingActualCash.toNumber(), openingDifference: session.openingDifference.toNumber() };
}

export type CourseTodoAccess = { payments: boolean; attendance: boolean; followUp: boolean; staffScope: string | null };
export async function getCourseHomeTodos(storeId: string, access: CourseTodoAccess, now = new Date(), offset = 0, limit = 5) {
  const parts: Prisma.Sql[] = [];
  if (access.payments) parts.push(Prisma.sql`SELECT id, 'payment' kind, name label, "createdAt" date FROM "CoursePurchase" WHERE "storeId"=${storeId} AND status='PENDING'`);
  if (access.attendance) parts.push(Prisma.sql`SELECT s.id, 'attendance' kind, s."nameSnapshot" label, s."startsAt" date FROM "CourseSession" s WHERE s."storeId"=${storeId} AND s."cancelledAt" IS NULL AND s."endsAt"<=${new Date(now.getTime()-3600000)} AND EXISTS (SELECT 1 FROM "CourseBooking" b WHERE b."storeId"=${storeId} AND b."sessionId"=s.id AND b.status='RESERVED')`);
  if (access.followUp) parts.push(Prisma.sql`SELECT id, 'followUp' kind, COALESCE("customerDisplayName",'顧客跟進') label, "createdAt" date FROM "DigitalButlerLead" WHERE "storeId"=${storeId} AND status IN ('NEW','CONTACTING','QUOTED') ${access.staffScope ? Prisma.sql`AND "assignedStaffId"=${access.staffScope}` : Prisma.empty}`);
  if (!parts.length) return { total: 0, items: [] };
  const union = Prisma.join(parts, " UNION ALL ");
  // Single statement snapshot: totals and limited items agree even during concurrent updates.
  const [result] = await prisma.$queryRaw<Array<{ total: number; items: Array<{id:string;kind:string;label:string;date:string}> }>>(Prisma.sql`
    WITH tasks AS (${union}), page AS (SELECT * FROM tasks ORDER BY date,id LIMIT ${limit} OFFSET ${offset})
    SELECT (SELECT count(*)::int FROM tasks) total, COALESCE((SELECT json_agg(page ORDER BY date,id) FROM page),'[]'::json) items`);
  return { total: result.total, items: result.items.map(item => ({ ...item, href: item.kind === "payment" ? `/dashboard/revenue?dateFrom=${toLocalDateStr(new Date(item.date))}&dateTo=${toLocalDateStr(new Date(item.date))}&status=PENDING` : item.kind === "attendance" ? `/dashboard/courses?date=${toLocalDateStr(new Date(item.date))}&action=booking&session=${encodeURIComponent(item.id)}` : `/dashboard/digital-butler/leads?leadId=${encodeURIComponent(item.id)}` })) };
}
