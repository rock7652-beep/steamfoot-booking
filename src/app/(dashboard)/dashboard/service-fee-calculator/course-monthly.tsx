import { CourseMonthlyNotifications } from "./course-monthly-notifications";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { requireCourseStore } from "@/lib/industry-module-server";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { readCourseMonthlySettlement } from "@/server/services/course-monthly-settlement";
import { summarizeSettlement } from "@/lib/course-monthly-settlement";
import { monthRange,toLocalMonthStr,formatTWDateTime } from "@/lib/date-utils";
import { PageShell,PageHeader } from "@/components/desktop";
import { CourseMonthlySettings,CourseMonthlyConfirm,CourseProfitCorrect,CourseMonthlyReport } from "./course-monthly-client";
import { CourseFeeCorrectionButton } from "../revenue/_components/course-fee-payment-button";
import { IncomeMonthFilter } from "@/components/income-month-filter";
import {DashboardLink as Link} from "@/components/dashboard-link";
const money=(n:number)=>`NT$ ${n.toLocaleString()}`;
export async function CourseMonthly({storeId,month,readOnly=false}:{storeId:string;month:string;readOnly?:boolean}){
 const user=await getCurrentUser();
 if(!user||user.role!=="OWNER"||!await checkPermission(user.role,user.staffId,"report.read"))return <p>僅店長可查看課程月結。</p>;
 await requireCourseStore(storeId);
 if(!await hasStoreFeature(storeId,FEATURES.SERVICE_FEE_CALCULATOR))return <p>月結管理尚未開通。</p>;
 const report=await coursePrisma.$transaction(tx=>readCourseMonthlySettlement(tx,storeId,month),{isolationLevel:"RepeatableRead",timeout:20000});
 const period=monthRange(month);
 const changedOlder=await coursePrisma.coursePurchase.findMany({where:{storeId,confirmedAt:{lt:period.start},OR:[{voidedAt:{gte:period.start,lte:period.end}},{refunds:{some:{storeId,createdAt:{gte:period.start,lte:period.end}}}}]},select:{confirmedAt:true}});
 const olderMonths=[...new Set(changedOlder.filter(o=>o.confirmedAt).map(o=>toLocalMonthStr(o.confirmedAt!)))].sort();
 const last=report.revisions[0],confirmed=last?.fingerprint===report.fingerprint;
 const [canSettings,canPay,store]=await Promise.all([checkPermission(user.role,user.staffId,"staff.manage"),checkPermission(user.role,user.staffId,"cashbook.create"),prisma.store.findUnique({where:{id:storeId},select:{name:true}})]);
 const issues=report.lines.filter(l=>l.issue||l.amount===null).length;
 return <PageShell className="flex w-full min-w-0 flex-col gap-2 py-2">
 <PageHeader title="每月收入結算" subtitle={store?.name??"本店"} actions={<IncomeMonthFilter month={month}/>}/>
 <CourseMonthlyReport key={month} lines={report.lines} status={<span role="status" className={`rounded-full px-3 py-1 text-sm ${confirmed?"bg-primary-50 text-primary-800":"bg-amber-50 text-amber-900"}`}>{confirmed?"已確認":last?"有異動":"待確認"}</span>} confirm={!confirmed&&!readOnly&&<CourseMonthlyConfirm key={report.fingerprint} month={month} fingerprint={report.fingerprint} revision={last?.revision??0} disabled={issues>0||!report.lines.length} blockedReason={issues>0?`請先核對 ${issues} 筆金額。`:!report.lines.length?"本月沒有結算項目。":undefined}/>} actions={<>
 {!readOnly&&<CourseMonthlyNotifications key={`${month}:${last?.revision??0}:${report.fingerprint}:${report.settings.revision}`} month={month} revision={last?.revision??0} enabled={report.settings.personalIncomeEnabled} confirmed={confirmed}/>}
 <CourseMonthlySettings key={report.settings.revision} settings={report.settings} canEdit={canSettings&&!readOnly}/>
 </>}/>
 {!!olderMonths.length&&<p className="rounded-lg bg-amber-50 p-3 text-sm">退款／作廢影響先前結算：{olderMonths.map(m=><Link key={m} className="ml-3 underline" href={`/dashboard/service-fee-calculator?month=${m}`}>{m} 查看</Link>)}</p>}
 <div className="space-y-3">

 {!!last&&<details className="group/history rounded-lg border border-earth-200 bg-white px-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm"><span>結算紀錄（{report.revisions.length}）</span><span aria-hidden="true" className="group-open/history:hidden">＋</span><span aria-hidden="true" className="hidden group-open/history:inline">－</span></summary>{report.revisions.map(r=><details key={r.id} className="border-t py-2"><summary className="min-h-11 cursor-pointer text-sm">第 {r.revision} 版 · {formatTWDateTime(r.createdAt)}</summary><p className="text-xs text-earth-500">{r.reason}</p>{summarizeSettlement(r.snapshot).map(p=><p key={p.id} className="flex justify-between gap-3 py-2 text-sm"><span>{p.name}</span><span>{p.issues>0?"待核對":money(p.profit+p.fee)}</span></p>)}</details>)}</details>}
 {report.lines.some(l=>l.payments.length>0)&&<details className="group/history rounded-lg border border-earth-200 bg-white px-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm"><span>歷史付款紀錄</span><span aria-hidden="true" className="group-open/history:hidden">＋</span><span aria-hidden="true" className="hidden group-open/history:inline">－</span></summary>{report.lines.filter(l=>l.payments.length>0).map(line=><div key={line.kind+line.id} className="border-t py-3 text-sm"><p className="font-medium">{line.name} · {line.label}</p>{line.payments.map(p=><div key={p.id} className="my-2 space-y-1 rounded bg-earth-50 p-3"><p>{formatTWDateTime(new Date(p.date))} · {money(p.amount)} · {p.voided?"已更正":"已登記"}</p><p>{p.note}{p.reason&&` · ${p.reason}`}</p>{!readOnly&&canPay&&!p.voided&&(line.kind==="PROFIT"?<CourseProfitCorrect paymentId={p.id}/>:<CourseFeeCorrectionButton paymentId={p.id}/>)}</div>)}</div>)}</details>}
 </div>
 </PageShell>;
}
