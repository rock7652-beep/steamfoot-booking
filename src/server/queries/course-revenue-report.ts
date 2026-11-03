import { courseDisplayName } from "@/lib/course-template-presentation";
import {coursePurchaseCashflow} from "@/server/services/music-tuition-cashflow";
import "server-only";
import { musicPurchaseWhere, musicTrialBookingWhere } from "@/server/services/music-finance-scope";
import { musicDataScope } from "@/server/services/music-data-scope";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { requireCourseStore } from "@/lib/industry-module-server";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import {moduleRevenueReport,type ModuleRevenueRow} from "@/lib/module-revenue-report";
import type { ReportFilters } from "@/lib/report-queries";
import { type PaymentSplitInput } from "@/lib/payment-splits";
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
    coursePurchaseCashflow(tx,storeId,range,filters.dataScope),
    tx.coursePurchaseRefund.findMany({ where: { storeId, createdAt: range, ...(musicDataScope(storeId,filters.dataScope??undefined)?{purchase:musicPurchaseWhere(storeId,filters.dataScope)}:{}) }, include: { purchase: true } }),
    prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } }),
    tx.courseTrialPayment.findMany({where:{storeId,OR:[{createdAt:range},{voidedAt:range}],...(musicDataScope(storeId,filters.dataScope??undefined)?{booking:musicTrialBookingWhere(storeId,filters.dataScope)}:{})},include:{booking:{select:{customerId:true,customerName:true,session:{select:{nameSnapshot:true}}}}}}),
  ]);
  const purchases = [...orders,...refunds.map((r) => r.purchase)];
  const customerIds = [...new Set([...purchases.map((p) => p.customerId).filter((id): id is string => !!id),...trialReceipts.map(p=>p.booking.customerId).filter((id): id is string => !!id)])];
  const [people, staff, firstOrders] = await Promise.all([
    prisma.customer.findMany({ where: { storeId, id: { in: customerIds } }, select: { id:true,name:true,phone:true } }),
    prisma.staff.findMany({ where: { storeId }, select: { id:true,userId:true,displayName:true,user:{select:{role:true}} } }),
    tx.coursePurchase.findMany({ where: { storeId, ...musicPurchaseWhere(storeId,filters.dataScope), customerId: { in: customerIds }, status: { in: ["CONFIRMED","REFUNDED"] } }, orderBy: [{confirmedAt:"asc"},{id:"asc"}], distinct:["customerId"], select:{id:true,customerId:true} }),
  ]);
  type Row = ModuleRevenueRow;
  const rows: Row[] = [];
  const peopleById = new Map(people.map((person) => [person.id,person]));
  const staffById = new Map(staff.map((person) => [person.id,person]));
  const staffByUser = new Map(staff.map((person) => [person.userId,person]));
  const firstPurchaseIds = new Set(firstOrders.map((order) => order.id));
  function add(order: Pick<typeof purchases[number],"revenueStaffId"|"confirmedBy"|"name"|"unit"|"id"> & {customerId: string | null; customerName?: string}, amount: number, date: Date, id: string, note: string, refund: boolean, actorId: string | null, method = "TRANSFER", splits: PaymentSplitInput[] = []) {
    const person = peopleById.get(order.customerId ?? "");
    const owner = order.revenueStaffId ? staffById.get(order.revenueStaffId) : staffByUser.get(order.confirmedBy ?? "");
    rows.push({ id,transactionNo:null,transactionDate:toLocalDateStr(date),storeName:store.name,
      customerName:person?.name??order.customerName??"顧客資料待核對",customerPhone:person?.phone??"",customerId:order.customerId,
      coachName:owner?.displayName??null,coachRole:owner?.user.role??null,staffId:owner?.id??null,
      planName:order.name,planType:order.unit,unit:order.unit,grossAmount:amount,discountAmount:0,netAmount:amount,
      paymentMethod:splits.length?"MIXED":method,paymentSplits:splits,status:refund?"REFUNDED":"SUCCESS",isFirstPurchase:!refund&&firstPurchaseIds.has(order.id),
      note,createdByName:staffByUser.get(actorId ?? "")?.displayName??null,createdAt:date.toISOString(),refund });
  }
  for (const order of orders) if (order.confirmedAt) add(order,order.price,order.confirmedAt,order.cashflowId,order.note,false,order.confirmedBy,order.paymentMethod??"TRANSFER");
  for (const refund of refunds) add(refund.purchase,-refund.amount,refund.createdAt,refund.id,refund.reason,true,refund.actorUserId,refund.method);
  for (const receipt of trialReceipts) {
    const order={id:receipt.id,customerId:receipt.booking.customerId,customerName:receipt.booking.customerName,revenueStaffId:null,confirmedBy:receipt.actorUserId,name:`體驗 · ${courseDisplayName(receipt.booking.session.nameSnapshot)}`,unit:"TRIAL"};
    const splits=Array.isArray(receipt.paymentSplits)?receipt.paymentSplits as PaymentSplitInput[]:[];
    if(receipt.createdAt>=range.gte && receipt.createdAt<=range.lte) add(order,receipt.amount,receipt.createdAt,receipt.id,receipt.note,false,receipt.actorUserId,receipt.paymentMethod,splits);
    if(receipt.voidedAt && receipt.voidedAt>=range.gte && receipt.voidedAt<=range.lte) add(order,-receipt.amount,receipt.voidedAt,`${receipt.id}:void`,receipt.voidReason??"體驗收款更正沖銷",true,receipt.actorUserId,receipt.paymentMethod,splits.map(s=>({...s,amount:-s.amount})));
  }
  return moduleRevenueReport(rows,storeId,store.name,filters);
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
