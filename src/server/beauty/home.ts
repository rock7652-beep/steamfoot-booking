import "server-only";
import { Prisma } from "../../../generated/beauty-client";
import { beautyPrisma } from "@/lib/beauty-db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { beautyManager } from "./access";
import { getCourseHomeCustomers, getCourseHomeTodos, type CourseTodoAccess } from "@/server/queries/course-home";

export function beautyDailyHref(value: string) {
  const [path, query] = value.split("?");
  const params = new URLSearchParams(query);
  if (path === "/dashboard/courses") {
    params.set("tab", params.get("view") === "customers" ? "顧客管理" : params.get("view")==="settings"?"設定":"班表");
    params.delete("view");
  } else if (path === "/dashboard/revenue") {
    params.set("tab", "營運");
    if (params.has("dateFrom")) params.set("startDate", params.get("dateFrom")!);
    if (params.has("dateTo")) params.set("endDate", params.get("dateTo")!);
  } else if (path === "/dashboard/growth") {
    params.set("tab", "顧客經營");
  } else if (path === "/dashboard/courses/unassigned-plans") {
    params.set("tab", "首頁");
    params.set("daily", "unassigned");
  } else if (path === "/dashboard/courses/todos") {
    params.set("tab", "首頁");
    params.set("daily", "todos");
  } else if(path==='/dashboard')params.set('tab','首頁');else return value;
  return `/dashboard/beauty?${params}`;
}

export async function getBeautyHomeToday(storeId: string, date: string, now = new Date()) {
  const actor = await beautyManager("booking.read");
  if (actor.storeId !== storeId) throw new Error("無權讀取其他店家");
  const { start, end } = dayRange(date);
  const [row] = await beautyPrisma.$queryRaw<Array<{sessions:number;ended:number;bookings:number;attended:number;nextEnd:Date|null}>>`
    SELECT count(*)::int sessions,
      count(*) FILTER (WHERE status='COMPLETED')::int ended,
      count(*)::int bookings,
      count(*) FILTER (WHERE status='COMPLETED')::int attended,
      min("endsAt") FILTER (WHERE status='RESERVED' AND "endsAt">${now}) AS "nextEnd"
    FROM "BeautyAppointment" WHERE "storeId"=${storeId} AND status<>'CANCELLED'
      AND "startsAt" BETWEEN ${start} AND ${end}`;
  return row;
}

export async function getBeautyHomeReceipts(storeId:string, from:string, to:string) {
  const actor=await beautyManager("transaction.read");
  if(actor.storeId!==storeId)throw new Error("無權讀取其他店家");
  const {start}=dayRange(from),{end}=dayRange(to);
  const [row]=await beautyPrisma.$queryRaw<Array<{purchases:number;purchaseCount:number;trial:number;refunds:number;voids:number}>>`
    SELECT COALESCE(sum(amount) FILTER (WHERE kind='SALE'),0)::float8 purchases,
      count(*) FILTER (WHERE kind='SALE')::int "purchaseCount",0::float8 trial,
      COALESCE(-sum(amount) FILTER (WHERE kind='REFUND'),0)::float8 refunds,0::float8 voids
    FROM "BeautyPayment" WHERE "storeId"=${storeId} AND "createdAt" BETWEEN ${start} AND ${end}`;
  return {...row,gross:row.purchases,net:row.purchases-row.refunds};
}

export async function getBeautyHomeCustomers(storeId:string, staffId:string|null, scope:string|null) {
  const actor=await beautyManager("customer.read");
  if(actor.storeId!==storeId)throw new Error("無權讀取其他店家");
  // Customer identities and attribution are shared; reuse the original authoritative count.
  return getCourseHomeCustomers(storeId,staffId,scope);
}

function beautyUnassignedPlanWhere(storeId:string, scope:string|null) {
 return Prisma.sql`c."storeId"=${storeId} AND c."mergedIntoCustomerId" IS NULL AND (u.id IS NULL OR u.status='ACTIVE')
      ${scope?Prisma.sql`AND c."assignedStaffId"=${scope}`:Prisma.empty}
      AND NOT EXISTS (SELECT 1 FROM "BeautyCard" k WHERE k."storeId"=c."storeId" AND (k."customerId"=c.id OR c.id=ANY(k."memberIds")))
      AND NOT EXISTS (SELECT 1 FROM "BeautyPurchase" p WHERE p."storeId"=c."storeId" AND p."customerId"=c.id AND p.status IN ('PENDING','CONFIRMED'))`;
}
export async function getBeautyUnassignedPlanCount(storeId:string, scope:string|null) {
  const actor=await beautyManager("wallet.read");
  if(actor.storeId!==storeId)throw new Error("無權讀取其他店家");
  const [row]=await beautyPrisma.$queryRaw<Array<{total:number}>>(Prisma.sql`
    SELECT count(*)::int total FROM "Customer" c LEFT JOIN "User" u ON u.id=c."userId"
    WHERE ${beautyUnassignedPlanWhere(storeId,scope)}`);
  return row.total;
}

export async function getBeautyUnassignedPlanPage(storeId:string, scope:string|null, requestedPage=1) {
 const actor=await beautyManager('wallet.read');
 if(actor.storeId!==storeId)throw new Error('無權讀取其他店家');
 const page=Number.isFinite(requestedPage)?Math.max(1,Math.min(10000,Math.floor(requestedPage))):1,pageSize=30;
 const [row]=await beautyPrisma.$queryRaw<Array<{total:number;page:number;rows:Array<{id:string;name:string;phoneLastFour:string|null;createdAt:string;staffName:string|null}>}>>(Prisma.sql`
  WITH candidates AS (
   SELECT c.id,c.name,RIGHT(c.phone,4) AS "phoneLastFour",c."createdAt",s."displayName" AS "staffName"
   FROM "Customer" c LEFT JOIN "User" u ON u.id=c."userId" LEFT JOIN "Staff" s ON s.id=c."assignedStaffId" AND s."storeId"=c."storeId"
   WHERE ${beautyUnassignedPlanWhere(storeId,scope)}
  ),totals AS (SELECT count(*)::int total FROM candidates),paging AS (
   SELECT total,LEAST(${page},GREATEST(1,CEIL(total::numeric/${pageSize})::int))::int page FROM totals
  ), selected AS (SELECT * FROM candidates ORDER BY "createdAt",id LIMIT ${pageSize} OFFSET (SELECT (page-1)*${pageSize} FROM paging))
  SELECT total,page,COALESCE((SELECT json_agg(selected ORDER BY "createdAt",id) FROM selected),'[]'::json) rows FROM paging`);
 return {...row,pageSize};
}

export async function getBeautyHomeTodos(storeId:string, access:CourseTodoAccess, now=new Date(), offset=0, limit=5) {
  const actor=await beautyManager("booking.read");
  if(actor.storeId!==storeId)throw new Error("無權讀取其他店家");
  const parts:Prisma.Sql[]=[];
  if(access.payments)parts.push(Prisma.sql`SELECT p.id,'payment' kind,n.name label,p."createdAt" date FROM "BeautyPurchase" p JOIN "BeautyPlan" n ON n.id=p."planId" AND n."storeId"=p."storeId" WHERE p."storeId"=${storeId} AND p.status='PENDING'`);
  if(access.attendance)parts.push(Prisma.sql`SELECT id,'attendance' kind,"serviceName" label,"startsAt" date FROM "BeautyAppointment" WHERE "storeId"=${storeId} AND status='RESERVED' AND "endsAt"<=${now}`);
  if(!parts.length&&!access.followUp)return {total:0,items:[]};
  // Fetch each core's prefix before merging; applying the offset per core loses tasks.
  // The restricted Beauty role must never query the shared DigitalButlerLead table.
  const take=offset+limit;
  const [rows,followUp]=await Promise.all([
    parts.length?beautyPrisma.$queryRaw<Array<{total:number;items:Array<{id:string;kind:string;label:string;date:string}>}>>(Prisma.sql`
    WITH tasks AS (${Prisma.join(parts," UNION ALL ")}), page AS (SELECT * FROM tasks ORDER BY date,id LIMIT ${take} OFFSET 0)
    SELECT (SELECT count(*)::int FROM tasks) total,COALESCE((SELECT json_agg(page ORDER BY date,id) FROM page),'[]'::json) items`)
    :Promise.resolve([{total:0,items:[]}]),
    access.followUp?getCourseHomeTodos(storeId,{payments:false,attendance:false,followUp:true,staffScope:access.staffScope},now,0,take):Promise.resolve({total:0,items:[]}),
  ]);
  const row=rows[0];
  const items=[...row.items,...followUp.items].sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()||(a.id<b.id?-1:a.id>b.id?1:0)||(a.kind<b.kind?-1:a.kind>b.kind?1:0)).slice(offset,offset+limit);
  return {total:row.total+followUp.total,items:items.map(item=>({...item,href:item.kind==='followUp'?`/dashboard/digital-butler/leads?leadId=${encodeURIComponent(item.id)}`:beautyDailyHref(item.kind==='payment'?`/dashboard/revenue?area=purchases&dateFrom=${toLocalDateStr(new Date(item.date))}&dateTo=${toLocalDateStr(new Date(item.date))}`:`/dashboard/courses?date=${toLocalDateStr(new Date(item.date))}&bookingId=${encodeURIComponent(item.id)}`)}))};
}
