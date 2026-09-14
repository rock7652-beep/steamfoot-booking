import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { dayRange } from "@/lib/date-utils";
export type NotificationRow = {
  id: string;
  audience: string;
  recipient: string;
  type: string;
  status: string;
  body: string | null;
  error: string | null;
  at: Date;
  customerId: string | null;
  channel: string | null;
  responseAction: string | null;
  planName: string | null;
  managerStatus: string | null;
  managerError: string | null;
};
export async function listNotificationCenterLogs(
  params: Record<string, string | undefined>,
) {
  const user = await requirePermission("business_hours.manage");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId)
    return {
      rows: [] as NotificationRow[],
      page: 1,
      hasMore: false,
      typeOptions: [] as string[],
    };
  const page = Math.max(
    1,
    Math.min(1000, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const conditions: Prisma.Sql[] = [];
  if (params.audience && ["manager", "customer"].includes(params.audience))
    conditions.push(Prisma.sql`audience=${params.audience}`);
  if (
    params.status &&
    ["SENT", "FAILED", "PENDING", "SKIPPED"].includes(params.status)
  )
    conditions.push(Prisma.sql`status=${params.status}`);
  if (params.search)
    conditions.push(
      Prisma.sql`recipient ILIKE ${`%${params.search.slice(0, 100)}%`}`,
    );
  if (params.type)
    conditions.push(Prisma.sql`type=${params.type.slice(0, 100)}`);
  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    const { start, end } = dayRange(params.date);
    if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()))
      conditions.push(Prisma.sql`at >= ${start} AND at <= ${end}`);
  }
  const where = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;
  const [rows, rules] = await Promise.all([
    prisma.$queryRaw<NotificationRow[]>(Prisma.sql`
    WITH notifications AS (
      SELECT 'manager:'||id AS id, 'manager' AS audience, "recipientName" AS recipient, type, status, "renderedBody" AS body, "errorMessage" AS error, COALESCE("sentAt","createdAt") AS at, NULL::text AS "customerId", 'LINE（分店）' AS channel, NULL::text AS "responseAction", NULL::text AS "planName", NULL::text AS "managerStatus", NULL::text AS "managerError" FROM "ManagerNotificationLog" WHERE "storeId"=${storeId}
      UNION ALL
      SELECT 'message:'||m.id, 'customer', c.name, COALESCE(r.name,'手動發送'), m.status::text, m."renderedBody", m."errorMessage",COALESCE(m."sentAt",m."createdAt"),c.id,CASE WHEN m.channel::text='LINE' THEN CASE m."lineRoute"::text WHEN 'CENTRAL' THEN 'LINE（中央）' WHEN 'STORE' THEN 'LINE（分店）' ELSE 'LINE（舊紀錄）' END ELSE m.channel::text END,NULL,NULL,NULL,NULL FROM "MessageLog" m JOIN "Customer" c ON c.id=m."customerId" AND c."storeId"=m."storeId" LEFT JOIN "ReminderRule" r ON r.id=m."ruleId" AND r."storeId"=m."storeId" WHERE m."storeId"=${storeId}
      UNION ALL
      SELECT 'balance:'||n.id, 'customer', c.name, n.type::text,n.status::text,n."renderedBody",n."errorMessage",COALESCE(n."sentAt",n."createdAt"),c.id,'LINE',n."responseAction",p.name,n."managerNotificationStatus"::text,n."managerNotificationError" FROM "SessionBalanceNotification" n JOIN "Customer" c ON c.id=n."customerId" AND c."storeId"=n."storeId" LEFT JOIN "CustomerPlanWallet" w ON w.id=n."walletId" AND w."storeId"=n."storeId" LEFT JOIN "ServicePlan" p ON p.id=w."planId" AND p."storeId"=n."storeId" WHERE n."storeId"=${storeId}
    ) SELECT * FROM notifications ${where} ORDER BY at DESC,id DESC LIMIT 31 OFFSET ${(page - 1) * 30}
  `),
    prisma.reminderRule.findMany({
      where: { storeId },
      select: { name: true },
      distinct: ["name"],
    }),
  ]);
  return {
    rows: rows.slice(0, 30),
    page,
    hasMore: rows.length > 30,
    typeOptions: ["手動發送", ...rules.map((r) => r.name)],
  };
}
