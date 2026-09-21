import "server-only";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { requireCourseStore } from "@/lib/industry-module-server";
import { dayRange, monthRange, toLocalDateStr } from "@/lib/date-utils";
import { businessComparisonRange, summarizeCourseBusiness, type BusinessScope } from "@/lib/course-business-analytics";
import { shiftCourseCalendarDate, type CourseAnalysisRange } from "@/lib/course-analytics";
export async function getCourseBusinessAnalytics(storeId: string, range: CourseAnalysisRange, scope: BusinessScope, access: { money: boolean; customers: boolean; fees: boolean }) {
  await requireCourseStore(storeId);
  const end = new Date(Math.min(dayRange(range.endDate).end.getTime(), Date.now()));
  const historyStart = dayRange(shiftCourseCalendarDate(toLocalDateStr(end).slice(0,7)+"-01",-5)).start;
  const moneyStart = new Date(Math.min(+historyStart,+dayRange(range.startDate).start));
  const [customers, staff, records] = await Promise.all([
    prisma.customer.findMany({where:{storeId},select:{id:true,name:true,assignedStaffId:true}}),
    prisma.staff.findMany({where:{storeId},select:{id:true,displayName:true,courseCoachEnabled:true,user:{select:{role:true}}}}),
    coursePrisma.$transaction(async tx => {
      const [sessions,purchases,fees,receipts,refunds] = await Promise.all([
        tx.courseSession.findMany({where:{storeId,cancelledAt:null,startsAt:{lte:end}},select:{id:true,coachId:true,startsAt:true,endsAt:true,bookings:{where:{storeId,status:"ATTENDED"},select:{customerId:true,customerName:true,bookingKind:true,status:true}}}}),
        tx.coursePurchase.findMany({where:{storeId,status:{in:["CONFIRMED","REFUNDED"]},confirmedAt:{lte:end},price:{gt:0}},select:{id:true,customerId:true,confirmedAt:true,price:true,revenueStaffId:true,developerProfitSnapshot:true,refunds:{where:{storeId},select:{amount:true,createdAt:true}}}}),
        access.fees ? tx.courseCompensationSnapshot.findMany({where:{storeId},select:{sessionId:true,staffId:true,rule:true}}) : [],
        access.money ? tx.courseTrialPayment.findMany({where:{storeId,OR:[{createdAt:{gte:moneyStart,lte:end}},{voidedAt:{gte:moneyStart,lte:end}}]},select:{amount:true,createdAt:true,voidedAt:true,booking:{select:{customerId:true}}}}) : [],
        access.money ? tx.coursePurchaseRefund.findMany({where:{storeId,createdAt:{gte:moneyStart,lte:end}},select:{amount:true,createdAt:true,purchase:{select:{revenueStaffId:true}}}}) : [],
      ]);
      return {sessions,purchases,fees,receipts,refunds};
    },{isolationLevel:"RepeatableRead",timeout:20000}),
  ]);
  if(scope.view!=="store" && !["all","unassigned"].includes(scope.person) && !staff.some(s=>s.id===scope.person)) throw new Error("找不到本店分析對象");
  const input={customers:customers.map(c=>({id:c.id,name:c.name,managerId:c.assignedStaffId})),sessions:records.sessions,purchases:records.purchases.filter(p=>p.confirmedAt!==null).map(p=>({...p,confirmedAt:p.confirmedAt!})),fees:records.fees,range,scope};
  const data=summarizeCourseBusiness(input);
  const comparisonWindow=businessComparisonRange(range);
  const prior=comparisonWindow?summarizeCourseBusiness({...input,range:comparisonWindow.range}):null;
  const comparison=prior&&comparisonWindow?{...comparisonWindow,attendance:prior.attendance,trial:prior.trial.length,newCard:prior.newCard.length,renewal:prior.renewal.length,conversionRate:prior.conversionRate}:null;
  const anchor=toLocalDateStr(end).slice(0,7)+"-01";
  const monthlyTrend=Array.from({length:6},(_,i)=>{const startDate=shiftCourseCalendarDate(anchor,i-5);const monthEnd=toLocalDateStr(monthRange(startDate.slice(0,7)).end);const cutoff=toLocalDateStr(end);const endDate=monthEnd<cutoff?monthEnd:cutoff;const summary=summarizeCourseBusiness({...input,range:{startDate,endDate}});return {date:startDate.slice(0,7),attendance:summary.attendance,trial:summary.trial.length,newCard:summary.newCard.length,renewal:summary.renewal.length};});
  const start=dayRange(range.startDate).start;
  const matches=(id:string|null)=>scope.view==="store" || scope.person==="all" || (id??"unassigned")===scope.person;
  const customerMap=new Map(customers.map(c=>[c.id,c.assignedStaffId]));
  const salesIncome=records.purchases.filter(p=>p.confirmedAt && p.confirmedAt>=start && matches(p.revenueStaffId)).reduce((n,p)=>n+p.price,0);
  const refund=records.refunds.filter(r=>r.createdAt>=start&&matches(r.purchase.revenueStaffId)).reduce((n,r)=>n+r.amount,0);
  const trialIncome=records.receipts.filter(r=>matches(customerMap.get(r.booking.customerId)??null)).reduce((n,r)=>n+(r.createdAt>=start&&r.createdAt<=end?r.amount:0)-(r.voidedAt&&r.voidedAt>=start&&r.voidedAt<=end?r.amount:0),0);
  const dailyMoney=new Map<string,number>();
  const addMoney=(date:Date,amount:number)=>{const key=toLocalDateStr(date);dailyMoney.set(key,(dailyMoney.get(key)??0)+amount);};
  if(access.money&&scope.view!=="coach") {
    for(const p of records.purchases)if(p.confirmedAt&&p.confirmedAt>=moneyStart&&matches(p.revenueStaffId))addMoney(p.confirmedAt,p.price);
    for(const r of records.refunds)if(matches(r.purchase.revenueStaffId))addMoney(r.createdAt,-r.amount);
    for(const r of records.receipts)if(matches(customerMap.get(r.booking.customerId)??null)){if(r.createdAt>=moneyStart&&r.createdAt<=end)addMoney(r.createdAt,r.amount);if(r.voidedAt&&r.voidedAt>=moneyStart&&r.voidedAt<=end)addMoney(r.voidedAt,-r.amount);}
  }
  const monthlyMoney = new Map<string,number>();
  for (const [date,amount] of dailyMoney) {const month=date.slice(0,7);monthlyMoney.set(month,(monthlyMoney.get(month)??0)+amount);}
  const chartMonths=monthlyTrend.map(row=>({...row,...(access.money&&scope.view!=="coach"?{revenue:monthlyMoney.get(row.date)??0}:{})}));
  const dailyMetrics=new Map(data.trend.map(d=>[d.date,d]));
  const trend=[];
  for(let day=+start;day<=+end;day+=86400000){const date=toLocalDateStr(new Date(day));trend.push({...dailyMetrics.get(date),date,attendance:dailyMetrics.get(date)?.attendance??0,trial:dailyMetrics.get(date)?.trial??0,newCard:dailyMetrics.get(date)?.newCard??0,renewal:dailyMetrics.get(date)?.renewal??0,...(access.money&&scope.view!=="coach"?{revenue:dailyMoney.get(date)??0}:{})});}
  const segments={newVisitors:data.newVisitors,oldVisitors:data.oldVisitors,returned:data.returned,notReturned:data.notReturned,trial:data.trial,newCard:data.newCard,renewal:data.renewal,converted:data.converted,unconverted:data.unconverted,tracked:data.tracked,visitors:data.visitors};
  return {scope,range,staff,effectiveEndDate:toLocalDateStr(end),comparison,monthlyTrend:chartMonths,retentionBase:data.retentionBase,retentionRate:data.retentionRate,retentionRange:data.retentionRange,counts:Object.fromEntries(Object.entries(segments).map(([k,v])=>[k,v.length])) as Record<keyof typeof segments,number>,segments:access.customers?segments:null,eligibleTrials:data.eligibleTrials,conversionRate:data.conversionRate,sessions:data.sessions,hours:data.hours,attendance:data.attendance,fee:access.fees?data.fee:null,missingFees:access.fees?data.missingFees:0,profit:access.money&&scope.view==="manager"?data.profit:null,missingProfit:access.money?data.missingProfit:0,netRevenue:access.money&&scope.view!=="coach"?salesIncome-refund+trialIncome:null,trend};
}
export type CourseBusinessReport = Awaited<ReturnType<typeof getCourseBusinessAnalytics>>;
