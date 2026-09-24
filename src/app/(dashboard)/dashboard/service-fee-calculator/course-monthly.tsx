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
import { PageShell,PageHeader,KpiStrip } from "@/components/desktop";
import { CourseMonthlySettings,CourseMonthlyConfirm,CourseProfitPay,CourseProfitCorrect,CourseMonthlyPeople } from "./course-monthly-client";
import { CourseFeePaymentButton,CourseFeeCorrectionButton } from "../revenue/_components/course-fee-payment-button";
import { MonthFilter } from "../advanced-reports/month-filter";
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
 const people=summarizeSettlement(report.lines),last=report.revisions[0],confirmed=last?.fingerprint===report.fingerprint;
 const [canSettings,canPay,store]=await Promise.all([checkPermission(user.role,user.staffId,"staff.manage"),checkPermission(user.role,user.staffId,"cashbook.create"),prisma.store.findUnique({where:{id:storeId},select:{name:true}})]);
 const total=people.reduce((n,p)=>n+p.profit+p.fee,0),paid=people.reduce((n,p)=>n+p.paid,0),issues=report.lines.filter(l=>l.issue).length;
 const payable=report.lines.reduce((n,l)=>n+Math.max(0,(l.amount??0)-l.paid),0),overpaid=report.lines.reduce((n,l)=>n+Math.max(0,l.paid-(l.amount??0)),0);
 return <PageShell><div className="sticky top-16 z-10 space-y-2 bg-earth-50 py-2"><PageHeader title="課程月結管理" subtitle={`${store?.name??"本店"} · ${month}`} actions={<MonthFilter month={month}/>}/>
 <KpiStrip items={[{label:issues?"已知應付（未完整）":"目前應付",value:money(total),tone:"primary"},{label:"已登錄付款",value:money(paid)},{label:"待付",value:money(payable)},{label:"溢付待核對",value:money(overpaid),tone:overpaid?"amber":"primary"}]}/></div>
 <p className="rounded-lg bg-primary-50 p-3 text-sm">依方案核帳月份及課次上課月份歸屬，只納入已結束課次。已付包含後續付款；退款、作廢會調整原月份的應付金額。{issues>0&&` 尚有 ${issues} 筆待核對，合計僅包含可確認金額。`}</p>
 {!!olderMonths.length&&<p className="rounded-lg bg-amber-50 p-3 text-sm">本月退款／作廢涉及較早月份，請核對原月結：{olderMonths.map(m=><Link key={m} className="ml-3 underline" href={`/dashboard/service-fee-calculator?month=${m}`}>{m}</Link>)}</p>}
 <CourseMonthlySettings key={report.settings.revision} settings={report.settings} canEdit={canSettings&&!readOnly}/>
 <p role="status" className="rounded-lg border border-earth-200 bg-white p-3">{confirmed?`金額已確認 · 第 ${last.revision} 版（付款狀態持續更新）`:last?"金額已有異動，請核對明細並確認修正版；舊版保留。":"尚未確認本月金額"}</p>
 {!confirmed&&!readOnly&&<CourseMonthlyConfirm key={report.fingerprint} month={month} fingerprint={report.fingerprint} revision={last?.revision??0} disabled={issues>0||!report.lines.length} blockedReason={issues>0?`還有 ${issues} 筆待核對，暫時無法確認月結。請展開待處理人員明細，核對缺少的利潤分配或授課費紀錄。`:!report.lines.length?"本月沒有需結算的項目。":undefined}/>}
 <CourseMonthlyPeople entries={people.map(person=>({id:person.id,name:person.name,pending:person.issues>0||person.lines.some(l=>l.amount!==null&&l.paid!==l.amount),priority:person.issues>0?0:person.lines.some(l=>l.amount!==null&&l.paid>l.amount)?1:person.lines.some(l=>l.amount!==null&&l.paid<l.amount)?2:3}))}>
 {!people.length&&<p className="rounded-lg border p-6">此月份沒有需結算的利潤或授課費。</p>}
 {people.map(person=><details key={person.id} className="group/person rounded-xl border border-earth-200 bg-white p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{person.name}</strong><span className="text-sm text-primary-700"><span className="group-open/person:hidden">展開明細 ＋</span><span className="hidden group-open/person:inline">收合明細 －</span></span></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">{[["店長利潤",person.profit],["授課費",person.fee],["合計應付",person.profit+person.fee],["已付",person.paid],[person.remaining<0?"溢付待核對":"淨待付",Math.abs(person.remaining)]].map(([label,value])=><div key={label}><dt className="text-earth-500">{label}</dt><dd className="font-medium">{person.issues>0&&label!=="已付"?"待核對":money(Number(value))}</dd></div>)}</dl>{person.issues===0&&person.lines.every(l=>l.amount!==null&&l.paid===l.amount)&&<p className="mt-2 text-sm text-primary-700">{person.paid>0?"已付清":"無需付款"}</p>}{person.issues>0&&<p className="mt-2 text-sm text-amber-800">{person.issues} 筆需核對</p>}</summary>
 <div className="mt-3 divide-y divide-earth-100 border-t border-earth-100">{person.lines.map(line=><article key={line.kind+line.id} className="space-y-1 py-3 text-sm"><p className="font-medium">{line.kind==="PROFIT"?"店長利潤":"授課費"} · {line.label}</p><p>{formatTWDateTime(new Date(line.date))} · 應付 {line.amount===null?"待核對":money(line.amount)} · 已付 {money(line.paid)}</p>{line.issue&&<p role="alert" className="text-amber-800">{line.issue}</p>}{line.amount!==null&&line.paid>line.amount&&<p className="text-amber-800">已登錄付款 {money(line.paid)}，目前應付 {money(line.amount)}，多付 {money(line.paid-line.amount)} 待處理。請核對是否因退款／作廢調整；更正誤登不代表已收回款項。</p>}
 {!readOnly&&canPay&&confirmed&&!line.issue&&line.amount!==null&&line.amount>line.paid&&(line.kind==="PROFIT"?<CourseProfitPay key={`${line.id}:${line.paid}`} month={month} line={line}/>:<CourseFeePaymentButton sessionId={line.id} amount={line.amount}/>)}
 {!!line.payments.length&&<details><summary className="min-h-11 cursor-pointer py-3">付款與更正紀錄（{line.payments.length}）</summary>{line.payments.map(p=><div key={p.id} className="my-2 space-y-1 rounded bg-earth-50 p-3"><p>{formatTWDateTime(new Date(p.date))} · {money(p.amount)} · {p.voided?"已更正":"已付"}</p><p>{p.note}{p.reason&&` · 更正原因：${p.reason}`}</p>{!readOnly&&canPay&&!p.voided&&(line.kind==="PROFIT"?<CourseProfitCorrect paymentId={p.id}/>:<CourseFeeCorrectionButton paymentId={p.id}/>)}</div>)}</details>}
 </article>)}</div></details>)}
 </CourseMonthlyPeople>
 {!!last&&<details className="rounded-lg border bg-white p-4"><summary className="min-h-11 cursor-pointer">已確認版本（{report.revisions.length}）</summary>{report.revisions.map(r=><details key={r.id} className="border-t py-3"><summary className="min-h-11 cursor-pointer">第 {r.revision} 版 · {formatTWDateTime(r.createdAt)} · {r.reason}</summary>{summarizeSettlement(r.snapshot).map(p=><p key={p.id} className="py-2 text-sm">{p.name} · 店長利潤 {money(p.profit)} · 授課費 {money(p.fee)} · 確認當時已付 {money(p.paid)}</p>)}</details>)}</details>}
 </PageShell>;
}
