import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { requireCourseStore } from "@/lib/industry-module-server";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import type { ReportFilters, TransactionDetail, StoreRevenueSummary } from "@/lib/report-queries";
import { AppError } from "@/lib/errors";
export async function getCourseRevenueReport(storeId: string, filters: ReportFilters) {
  await requireCourseStore(storeId);
  for (const value of [filters.startDate, filters.endDate]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).valueOf()) || new Date(value).toISOString().slice(0,10) !== value)
      throw new AppError("VALIDATION", "日期格式不正確");
  }
  if (filters.startDate > filters.endDate) throw new AppError("VALIDATION", "開始日期不能晚於結束日期");
  const range = { gte: dayRange(filters.startDate).start, lte: dayRange(filters.endDate).end };
  return coursePrisma.$transaction(async (tx) => {
  const [orders, refunds, store] = await Promise.all([
    tx.coursePurchase.findMany({ where: { storeId, status: { in: ["CONFIRMED","REFUNDED"] }, confirmedAt: range } }),
    tx.coursePurchaseRefund.findMany({ where: { storeId, createdAt: range }, include: { purchase: true } }),
    prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } }),
  ]);
  const purchases = [...orders,...refunds.map((r) => r.purchase)];
  const customerIds = [...new Set(purchases.map((p) => p.customerId))];
  const [people, staff, firstOrders] = await Promise.all([
    prisma.customer.findMany({ where: { storeId, id: { in: customerIds } }, select: { id:true,name:true,phone:true } }),
    prisma.staff.findMany({ where: { storeId }, select: { id:true,userId:true,displayName:true,user:{select:{role:true}} } }),
    tx.coursePurchase.findMany({ where: { storeId, customerId: { in: customerIds }, status: { in: ["CONFIRMED","REFUNDED"] } }, orderBy: [{confirmedAt:"asc"},{id:"asc"}], distinct:["customerId"], select:{id:true,customerId:true} }),
  ]);
  type Row = TransactionDetail & { customerId: string; staffId: string | null; refund: boolean; unit: string };
  const rows: Row[] = [];
  const peopleById = new Map(people.map((person) => [person.id,person]));
  const staffById = new Map(staff.map((person) => [person.id,person]));
  const staffByUser = new Map(staff.map((person) => [person.userId,person]));
  const firstPurchaseIds = new Set(firstOrders.map((order) => order.id));
  function add(order: typeof purchases[number], amount: number, date: Date, id: string, note: string, refund: boolean, actorId: string | null, method = "OTHER") {
    const person = peopleById.get(order.customerId);
    const owner = order.revenueStaffId ? staffById.get(order.revenueStaffId) : staffByUser.get(order.confirmedBy ?? "");
    rows.push({ id,transactionNo:null,transactionDate:toLocalDateStr(date),storeName:store.name,
      customerName:person?.name??"顧客資料待核對",customerPhone:person?.phone??"",customerId:order.customerId,
      coachName:owner?.displayName??null,coachRole:owner?.user.role??null,staffId:owner?.id??null,
      planName:order.name,planType:order.unit,unit:order.unit,grossAmount:amount,discountAmount:0,netAmount:amount,
      paymentMethod:method === "CASH" ? "CASH" : "OTHER",status:refund?"REFUNDED":"SUCCESS",isFirstPurchase:!refund&&firstPurchaseIds.has(order.id),
      note,createdByName:staffByUser.get(actorId ?? "")?.displayName??null,createdAt:date.toISOString(),refund });
  }
  for (const order of orders) if (order.confirmedAt) add(order,order.price,order.confirmedAt,order.id,order.note,false,order.confirmedBy);
  for (const refund of refunds) add(refund.purchase,-refund.amount,refund.createdAt,refund.id,refund.reason,true,refund.actorUserId,refund.method);
  const keyword=filters.keyword?.trim().toLocaleLowerCase();
  const data=rows.filter((r)=>(!filters.planType||r.unit===filters.planType)&&(!filters.paymentMethod||r.paymentMethod===filters.paymentMethod)&&(!filters.coachId||r.staffId===filters.coachId)&&(!filters.coachRole||r.coachRole===filters.coachRole)&&(!keyword||[r.customerName,r.customerPhone,r.planName,r.note].some((s)=>s?.toLocaleLowerCase().includes(keyword)))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  const totalRevenue=data.filter((r)=>!r.refund).reduce((n,r)=>n+r.netAmount,0);
  const refundAmount=Math.abs(data.filter((r)=>r.refund).reduce((n,r)=>n+r.netAmount,0));
  const netRevenue=totalRevenue-refundAmount;
  const customerCount=new Set(data.filter((r)=>!r.refund).map((r)=>r.customerId)).size;
  const kpi={totalRevenue,refundAmount,netRevenue,txCount:data.filter((r)=>!r.refund).length,customerCount,avgPerCustomer:customerCount?Math.round(netRevenue/customerCount):0};
  const summary:StoreRevenueSummary[] = data.length ? [{...kpi,storeId,storeName:store.name,trialRevenue:0,packageRevenue:totalRevenue,singleRevenue:0,otherRevenue:0}] : [];
  return {data,summary,kpi,paymentMethods: data.some((r)=>!r.refund)?[{paymentMethod:"OTHER",amount:totalRevenue}]:[]};
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
