import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "../../../generated/course-client";
import { monthRange } from "@/lib/date-utils";
import { fixedCourseFee } from "@/lib/course-fee-payment";
import { currentDeveloperProfit, settlementMonth, type SettlementLine } from "@/lib/course-monthly-settlement";
export type SettlementSettings={profitEnabled:boolean;feeEnabled:boolean;personalIncomeEnabled:boolean;revision:number};
export async function readSettlementSettings(tx:Pick<Prisma.TransactionClient,"$queryRaw">,storeId:string):Promise<SettlementSettings> {
  const rows=await tx.$queryRaw<SettlementSettings[]>`SELECT "profitEnabled","feeEnabled",COALESCE((to_jsonb(s)->>'personalIncomeEnabled')::boolean,false) AS "personalIncomeEnabled",revision FROM "CourseSettlementSetting" s WHERE "storeId"=${storeId}`;
  return rows[0]??{profitEnabled:true,feeEnabled:true,personalIncomeEnabled:false,revision:0};
}
export type SettlementRevision={id:string;revision:number;fingerprint:string;snapshot:SettlementLine[];reason:string;createdAt:Date};
/** Uses a repeatable-read transaction for display, or the course store lock for writes. */
export async function readCourseMonthlySettlement(tx:Prisma.TransactionClient,storeId:string,month:string) {
  settlementMonth.parse(month);
  const {start,end}=monthRange(month);
  const [settings,orders,sessions,payments,feePayments,staff,revisions]=await Promise.all([
    readSettlementSettings(tx,storeId),
    tx.coursePurchase.findMany({where:{storeId,confirmedAt:{gte:start,lte:end},status:{in:["CONFIRMED","REFUNDED","VOIDED"]}},include:{refunds:true},orderBy:{id:"asc"}}),
    tx.$queryRaw<Array<{id:string;staffId:string;name:string;startsAt:Date;endsAt:Date;cancelledAt:Date|null;rule:unknown}>>`SELECT s.id,COALESCE(c."staffId",s."coachId") AS "staffId",s."nameSnapshot" AS name,s."startsAt",s."endsAt",s."cancelledAt",c.rule FROM "CourseSession" s LEFT JOIN "CourseCompensationSnapshot" c ON c."sessionId"=s.id AND c."storeId"=s."storeId" WHERE s."storeId"=${storeId} AND s."startsAt">=${start} AND s."startsAt"<=${end} ORDER BY s.id`,
    tx.$queryRaw<Array<{id:string;purchaseId:string;amount:number;createdAt:Date;note:string;voidedAt:Date|null;voidReason:string|null}>>`SELECT p.* FROM "CourseProfitPayment" p JOIN "CoursePurchase" o ON o.id=p."purchaseId" AND o."storeId"=p."storeId" WHERE p."storeId"=${storeId} AND o."confirmedAt">=${start} AND o."confirmedAt"<=${end} ORDER BY p."createdAt",p.id`,
    tx.$queryRaw<Array<{id:string;sessionId:string;amount:number;createdAt:Date;note:string;voidedAt:Date|null;voidReason:string|null}>>`SELECT p.* FROM "CourseFeePayment" p JOIN "CourseSession" s ON s.id=p."sessionId" AND s."storeId"=p."storeId" WHERE p."storeId"=${storeId} AND s."startsAt">=${start} AND s."startsAt"<=${end} ORDER BY p."createdAt",p.id`,
    tx.$queryRaw<Array<{id:string;displayName:string}>>`SELECT id,"displayName" FROM "Staff" WHERE "storeId"=${storeId}`,
    tx.$queryRaw<SettlementRevision[]>`SELECT id,revision,fingerprint,snapshot,reason,"createdAt" FROM "CourseMonthlySettlement" WHERE "storeId"=${storeId} AND month=${month} ORDER BY revision DESC`,
  ]);
  const names=new Map(staff.map(s=>[s.id,s.displayName]));
  const lines:SettlementLine[]=[];
  const paymentView=(p:typeof payments[number])=>({id:p.id,amount:p.amount,date:p.createdAt.toISOString(),note:p.note,voided:!!p.voidedAt,reason:p.voidReason});
  const profitByPurchase=new Map<string,typeof payments>();
  for(const p of payments){const group=profitByPurchase.get(p.purchaseId)??[];group.push(p);profitByPurchase.set(p.purchaseId,group);}
  const feesBySession=new Map<string,typeof feePayments>();
  for(const p of feePayments){const group=feesBySession.get(p.sessionId)??[];group.push(p);feesBySession.set(p.sessionId,group);}
  for(const order of orders){
    const history=profitByPurchase.get(order.id)??[];
    const amount=currentDeveloperProfit(order,order.refunds.reduce((n,r)=>n+r.amount,0));
    if(amount===0&&!history.length)continue;
    const issue=amount===null?"舊交易缺少分配紀錄，需核對":!order.revenueStaffId&&amount>0?"缺少開發人":null;
    lines.push({kind:"PROFIT",id:order.id,staffId:order.revenueStaffId,name:order.developerNameSnapshot??names.get(order.revenueStaffId??"")??"未指定人員",label:order.name,date:order.confirmedAt!.toISOString(),amount,paid:history.filter(p=>!p.voidedAt).reduce((n,p)=>n+p.amount,0),issue,payments:history.map(paymentView)});
  }
  for(const session of sessions){
    const history=feesBySession.get(session.id)??[];
    if(session.endsAt>new Date())continue;
    const fee=session.cancelledAt?0:fixedCourseFee(session.rule);
    if(fee===0&&!history.length)continue;
    const issue=fee===null?"舊課次費率需核對":!Number.isSafeInteger(fee)?"小數授課費需核對":null;
    lines.push({kind:"FEE",id:session.id,staffId:session.staffId,name:names.get(session.staffId)??"歷史教練",label:session.name,date:session.startsAt.toISOString(),amount:fee,paid:history.filter(p=>!p.voidedAt).reduce((n,p)=>n+p.amount,0),issue,payments:history.map(p=>paymentView({...p,purchaseId:""}))});
  }
  // Payments remain live. Confirmation freezes obligations, not payment status.
  const obligations=lines.map(({kind,id,staffId,name,label,date,amount,issue})=>({kind,id,staffId,name,label,date,amount,issue}));
  const fingerprint=createHash("sha256").update(JSON.stringify(obligations)).digest("hex");
  return {settings,lines,fingerprint,revisions};
}
