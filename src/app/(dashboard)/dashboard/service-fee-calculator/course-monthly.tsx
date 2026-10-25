import {getCoursePersonnelText} from "@/server/services/course-personnel-label";
import { canViewCourseMonthly, canOperateCourseMonthly } from "@/lib/course-monthly-access";
import {musicNativeWorkflowEnabled} from "@/server/services/music-native-workflow";
import { RosterTable } from "@/components/admin/roster-table";
import {canMusicFinance,readMusicFinanceScope,isMusicFinanceStore} from "@/server/services/music-finance-access";
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
export async function CourseMonthly({storeId,month,readOnly=false,teacherId,salaryData}:{storeId:string;month:string;readOnly?:boolean;teacherId?:string;salaryData?:string}){
 const user=await getCurrentUser();
 if(!user||!canViewCourseMonthly(user.role,musicNativeWorkflowEnabled(storeId))||!await checkPermission(user.role,user.staffId,"report.read"))return <p>僅店長可查看課程月結。</p>;
 const personnelText = await getCoursePersonnelText(storeId);
 if(!await canMusicFinance(user,storeId,"teacher.settlement.read"))return <p>{personnelText("尚未授權查看教師月結。")}</p>;

 const music=await isMusicFinanceStore(storeId);
 if(!canOperateCourseMonthly(user.role,musicNativeWorkflowEnabled(storeId)))readOnly=true;
 const scope=await readMusicFinanceScope(user,storeId);
 const canConfirm=scope===null && await canMusicFinance(user,storeId,"teacher.settlement.confirm");
 await requireCourseStore(storeId);
 if(!await hasStoreFeature(storeId,FEATURES.SERVICE_FEE_CALCULATOR))return <p>月結管理尚未開通。</p>;
 const report=await coursePrisma.$transaction(tx=>readCourseMonthlySettlement(tx,storeId,month),{isolationLevel:"RepeatableRead",timeout:20000});
 if(scope!==null){
   report.legacyTestLines=report.legacyTestLines.filter(l=>l.kind==="FEE" && l.staffId!==null && scope.includes(l.staffId));
   report.lines=report.lines.filter(l=>l.kind==="FEE" && l.staffId!==null && scope.includes(l.staffId));
   report.revisions=report.revisions.map(r=>({...r,snapshot:r.snapshot.filter(l=>l.kind==="FEE"&&l.staffId!==null&&scope.includes(l.staffId))}));
 }
 const legacyView=report.separationEnabled && salaryData==="legacy";
 const legacyCount=report.legacyTestLines.length;
 const operationalCount=report.lines.length;
 const cohortHref=(legacy:boolean)=>`/dashboard/service-fee-calculator?${new URLSearchParams({month,...(teacherId?{teacherId}:{}),...(legacy?{salaryData:"legacy"}:{})})}`;
 if(legacyView){report.lines=report.legacyTestLines;readOnly=true;}
 const period=monthRange(month);
 const changedOlder=await coursePrisma.coursePurchase.findMany({where:{storeId,confirmedAt:{lt:period.start},OR:[{voidedAt:{gte:period.start,lte:period.end}},{refunds:{some:{storeId,createdAt:{gte:period.start,lte:period.end}}}}]},select:{confirmedAt:true}});
 const olderMonths=[...new Set(changedOlder.filter(o=>o.confirmedAt).map(o=>toLocalMonthStr(o.confirmedAt!)))].sort();
 const last=report.revisions[0],confirmed=last?.fingerprint===report.fingerprint;
 const [canSettings,canCashPay,store]=await Promise.all([checkPermission(user.role,user.staffId,"staff.manage"),checkPermission(user.role,user.staffId,"cashbook.create"),prisma.store.findUnique({where:{id:storeId},select:{name:true}})]);
 const canPay=canCashPay&&await canMusicFinance(user,storeId,"teacher.settlement.pay");
 const issues=report.lines.filter(l=>l.issue||l.amount===null).length;
 return <PageShell className="flex w-full min-w-0 flex-col gap-2 py-2">
 {user.role==="ADMIN"&&<p className="text-sm text-earth-600">HQ 測試站操作：可確認月結、登錄發薪及沖回；操作會留下紀錄。</p>}
 <PageHeader title={music ? personnelText("教師薪資與月結") : "每月收入結算"} subtitle={store?.name??"本店"} actions={<div className="flex flex-wrap items-center justify-end gap-2">{music && <Link href="/dashboard/teachers" className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm">{personnelText("返回教師管理")}</Link>}<IncomeMonthFilter month={month}/></div>}/>
 {scope!==null&&<p className="text-sm text-earth-500">{personnelText("僅顯示授權教師；全店月結確認由全店授權人員處理。")}</p>}
 <CourseMonthlyReport canReadBookings={await checkPermission(user.role,user.staffId,"booking.read")} music={music} initialTeacherId={music?teacherId:undefined} canPay={canPay&&!readOnly} key={`${month}:${teacherId??"all"}:${legacyView}`} lines={report.lines} status={<span role="status" className={`rounded-full px-3 py-1 text-sm ${confirmed?"bg-primary-50 text-primary-800":"bg-amber-50 text-amber-900"}`}>{confirmed?"已確認":last?"有異動":"待確認"}</span>} confirm={!confirmed&&!readOnly&&canConfirm&&<CourseMonthlyConfirm key={report.fingerprint} month={month} fingerprint={report.fingerprint} revision={last?.revision??0} disabled={issues>0||!report.lines.length} blockedReason={issues>0?`請先核對 ${issues} 筆金額。`:!report.lines.length?"本月沒有結算項目。":undefined}/>} actions={<>
 {!readOnly&&scope===null&&<CourseMonthlyNotifications key={`${month}:${last?.revision??0}:${report.fingerprint}:${report.settings.revision}`} month={month} revision={last?.revision??0} enabled={report.settings.personalIncomeEnabled} confirmed={confirmed}/>}
 <CourseMonthlySettings key={report.settings.revision} settings={report.settings} canEdit={canSettings&&canConfirm&&!readOnly}/>
 </>}/>
 {!legacyView&&!!olderMonths.length&&<p className="rounded-lg bg-amber-50 p-3 text-sm">退款／作廢影響先前結算：{olderMonths.map(m=><Link key={m} className="ml-3 underline" href={`/dashboard/service-fee-calculator?month=${m}`}>{m} 查看</Link>)}</p>}
 <div className="space-y-3">

 {!legacyView&&!!last&&<details className="group/history rounded-lg border border-earth-200 bg-white px-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm"><span>{music ? "全店結算紀錄" : "結算紀錄"}（{report.revisions.length}）</span><span aria-hidden="true" className="group-open/history:hidden">＋</span><span aria-hidden="true" className="hidden group-open/history:inline">－</span></summary><RosterTable label="月結確認紀錄" columns={["版本", "確認日期", "調整原因", "人員／金額"]}>{report.revisions.map(r=><tr key={r.id}><td>第 {r.revision} 版</td><td>{formatTWDateTime(r.createdAt)}</td><td>{r.reason}</td><td><details><summary className="min-h-11 cursor-pointer py-2">查看明細（原確認範圍）</summary>{summarizeSettlement(r.snapshot).map(p=><p key={p.id}>{p.name} · {p.issues>0?"待核對":money(p.profit+p.fee)}</p>)}</details></td></tr>)}</RosterTable></details>}
 {report.lines.some(l=>l.payments.length>0)&&<details className="group/history rounded-lg border border-earth-200 bg-white px-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm"><span>{music ? "全店歷史付款紀錄" : "歷史付款紀錄"}</span><span aria-hidden="true" className="group-open/history:hidden">＋</span><span aria-hidden="true" className="hidden group-open/history:inline">－</span></summary><RosterTable label="發薪付款紀錄" columns={["付款日期", "人員／項目", "金額", "狀態", "明細／操作"]}>{report.lines.flatMap(line=>line.payments.map(p=><tr key={line.kind+p.id}><td>{formatTWDateTime(new Date(p.date))}</td><td><p className="font-medium">{line.name}</p><p>{line.label}</p></td><td className="text-right tabular-nums">{money(p.amount)}</td><td>{p.voided?"已更正":"已登記"}</td><td><details><summary className="min-h-11 cursor-pointer py-2">明細</summary><p>{p.note || "無備註"}</p>{p.reason&&<p>更正原因：{p.reason}</p>}</details>{!readOnly&&canPay&&!p.voided&&(line.kind==="PROFIT"?<CourseProfitCorrect paymentId={p.id}/>:<CourseFeeCorrectionButton paymentId={p.id}/>)}</td></tr>))}</RosterTable></details>}
 </div>
 </PageShell>;
}
