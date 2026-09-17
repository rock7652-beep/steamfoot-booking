import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { requireCourseStore } from "@/lib/industry-module-server";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import type { ReportFilters, TransactionDetail, StoreRevenueSummary } from "@/lib/report-queries";
import { paymentMethodReportAmount, type PaymentSplitInput } from "@/lib/payment-splits";
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
  const [orders, refunds, store, trialReceipts] = await Promise.all([
    tx.coursePurchase.findMany({ where: { storeId, status: { in: ["CONFIRMED","REFUNDED"] }, confirmedAt: range } }),
    tx.coursePurchaseRefund.findMany({ where: { storeId, createdAt: range }, include: { purchase: true } }),
    prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } }),
    tx.courseTrialPayment.findMany({where:{storeId,OR:[{createdAt:range},{voidedAt:range}]},include:{booking:{select:{customerId:true,customerName:true,session:{select:{nameSnapshot:true}}}}}}),
  ]);
  const purchases = [...orders,...refunds.map((r) => r.purchase)];
  const customerIds = [...new Set([...purchases.map((p) => p.customerId),...trialReceipts.map(p=>p.booking.customerId)])];
  const [people, staff, firstOrders] = await Promise.all([
    prisma.customer.findMany({ where: { storeId, id: { in: customerIds } }, select: { id:true,name:true,phone:true } }),
    prisma.staff.findMany({ where: { storeId }, select: { id:true,userId:true,displayName:true,user:{select:{role:true}} } }),
    tx.coursePurchase.findMany({ where: { storeId, customerId: { in: customerIds }, status: { in: ["CONFIRMED","REFUNDED"] } }, orderBy: [{confirmedAt:"asc"},{id:"asc"}], distinct:["customerId"], select:{id:true,customerId:true} }),
  ]);
  type Row = TransactionDetail & { customerId: string; staffId: string | null; refund: boolean; unit: string; paymentSplits: PaymentSplitInput[] };
  const rows: Row[] = [];
  const peopleById = new Map(people.map((person) => [person.id,person]));
  const staffById = new Map(staff.map((person) => [person.id,person]));
  const staffByUser = new Map(staff.map((person) => [person.userId,person]));
  const firstPurchaseIds = new Set(firstOrders.map((order) => order.id));
  function add(order: Pick<typeof purchases[number],"customerId"|"revenueStaffId"|"confirmedBy"|"name"|"unit"|"id">, amount: number, date: Date, id: string, note: string, refund: boolean, actorId: string | null, method = "TRANSFER", splits: PaymentSplitInput[] = []) {
    const person = peopleById.get(order.customerId);
    const owner = order.revenueStaffId ? staffById.get(order.revenueStaffId) : staffByUser.get(order.confirmedBy ?? "");
    rows.push({ id,transactionNo:null,transactionDate:toLocalDateStr(date),storeName:store.name,
      customerName:person?.name??"顧客資料待核對",customerPhone:person?.phone??"",customerId:order.customerId,
      coachName:owner?.displayName??null,coachRole:owner?.user.role??null,staffId:owner?.id??null,
      planName:order.name,planType:order.unit,unit:order.unit,grossAmount:amount,discountAmount:0,netAmount:amount,
      paymentMethod:splits.length?"MIXED":method,paymentSplits:splits,status:refund?"REFUNDED":"SUCCESS",isFirstPurchase:!refund&&firstPurchaseIds.has(order.id),
      note,createdByName:staffByUser.get(actorId ?? "")?.displayName??null,createdAt:date.toISOString(),refund });
  }
  for (const order of orders) if (order.confirmedAt) add(order,order.price,order.confirmedAt,order.id,order.note,false,order.confirmedBy);
  for (const refund of refunds) add(refund.purchase,-refund.amount,refund.createdAt,refund.id,refund.reason,true,refund.actorUserId,refund.method);
  for (const receipt of trialReceipts) {
    const order={id:receipt.id,customerId:receipt.booking.customerId,revenueStaffId:null,confirmedBy:receipt.actorUserId,name:`體驗 · ${receipt.booking.session.nameSnapshot}`,unit:"TRIAL"};
    const splits=Array.isArray(receipt.paymentSplits)?receipt.paymentSplits as PaymentSplitInput[]:[];
    if(receipt.createdAt>=range.gte && receipt.createdAt<=range.lte) add(order,receipt.amount,receipt.createdAt,receipt.id,receipt.note,false,receipt.actorUserId,receipt.paymentMethod,splits);
    if(receipt.voidedAt && receipt.voidedAt>=range.gte && receipt.voidedAt<=range.lte) add(order,-receipt.amount,receipt.voidedAt,`${receipt.id}:void`,receipt.voidReason??"體驗收款更正沖銷",true,receipt.actorUserId,receipt.paymentMethod,splits.map(s=>({...s,amount:-s.amount})));
  }
  const keyword=filters.keyword?.trim().toLocaleLowerCase();
  const data=rows.filter((r)=>(!filters.planType||r.unit===filters.planType)&&(!filters.paymentMethod||paymentMethodReportAmount({paymentMethod:r.paymentMethod,amount:r.netAmount,paymentSplits:r.paymentSplits},filters.paymentMethod)!==0)&&(!filters.coachId||r.staffId===filters.coachId)&&(!filters.coachRole||r.coachRole===filters.coachRole)&&(!keyword||[r.customerName,r.customerPhone,r.planName,r.note].some((s)=>s?.toLocaleLowerCase().includes(keyword)))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  const totalRevenue=data.filter((r)=>!r.refund).reduce((n,r)=>n+r.netAmount,0);
  const refundAmount=Math.abs(data.filter((r)=>r.refund).reduce((n,r)=>n+r.netAmount,0));
  const netRevenue=totalRevenue-refundAmount;
  const customerCount=new Set(data.filter((r)=>!r.refund).map((r)=>r.customerId)).size;
  const kpi={totalRevenue,refundAmount,netRevenue,txCount:data.filter((r)=>!r.refund).length,customerCount,avgPerCustomer:customerCount?Math.round(netRevenue/customerCount):0};
  const summary:StoreRevenueSummary[] = data.length ? [{...kpi,storeId,storeName:store.name,trialRevenue:data.filter(r=>r.unit==="TRIAL").reduce((n,r)=>n+r.netAmount,0),packageRevenue:data.filter(r=>r.unit!=="TRIAL"&&!r.refund).reduce((n,r)=>n+r.netAmount,0),singleRevenue:0,otherRevenue:0}] : [];
  const methods = new Map<string,number>();
  for (const row of data.filter(r=>!r.refund)) for (const split of row.paymentSplits.length ? row.paymentSplits : [{paymentMethod:row.paymentMethod,amount:row.netAmount}]) methods.set(split.paymentMethod,(methods.get(split.paymentMethod)??0)+split.amount);
  return {data,summary,kpi,paymentMethods:[...methods].map(([paymentMethod,amount])=>({paymentMethod,amount}))};
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
