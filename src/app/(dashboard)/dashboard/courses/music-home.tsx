import { musicCustomerWhere, musicDataSeparationEnabled } from "@/server/services/music-data-scope";
import { CourseTodoList } from "./todo-list";
import { Suspense, type ReactNode } from "react";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { HomeClockRefresh, HomeRetry } from "./home-controls";
import { getMusicHomeSchedule } from "@/server/queries/music-home";
import { getCourseHomeTodos, getCourseReceiptTotals } from "@/server/queries/course-home";
import { getCourseCustomerCare } from "@/server/queries/course-customer-care";
import { getOpeningMakeupWorkspace } from "@/server/queries/music-opening-makeup";
import { getMusicLeaveWorkspace } from "@/server/queries/music-leave-workspace";
import { courseHomeAccess } from "@/server/queries/course-home-access";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { dayRange, toLocalDateStr, toLocalMonthStr, formatTWDateTime } from "@/lib/date-utils";
import { checkPermission } from "@/lib/permissions";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { canMusicFinance, readMusicFinanceScope } from "@/server/services/music-finance-access";
import { readMusicPilotFeeProof } from "@/server/services/music-pilot-teacher-fee";
import { readMusicPilotTuition } from "@/server/services/music-pilot-policy";

type Access = Awaited<ReturnType<typeof courseHomeAccess>>;
type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
const action = "inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 py-2 text-sm font-medium text-primary-800 hover:bg-primary-50";
const studentHref = (id:string,tab="plans")=>`/dashboard/courses?view=customers&customerId=${encodeURIComponent(id)}&studentTab=${tab}`;
const testName = (name:string)=>/驗收|測試/.test(name);
function Box({title,children}:{title:string;children:ReactNode}) {return <section className="min-w-0 rounded-xl border border-earth-200 bg-white p-3"><h2 className="mb-2 text-sm font-semibold text-primary-900">{title}</h2>{children}</section>;}
async function ReadSection({title,load}:{title:string;load:()=>Promise<ReactNode>}) {
  let content:ReactNode;
  try {content=await load();} catch {content=<div className="space-y-2"><p role="alert" className="text-sm text-amber-900">待核對：此區資料暫時無法讀取，尚不能確認數量。</p><HomeRetry/></div>;}
  return <Box title={title}>{content}</Box>;
}
function Section(props:{title:string;load:()=>Promise<ReactNode>}) {return <Suspense fallback={<Box title={props.title}><p role="status" className="text-sm text-earth-600">讀取中…</p></Box>}><ReadSection {...props}/></Suspense>;}

export function MusicHome({user,storeId,date,access,careEnabled}:{user:User;storeId:string;date:string;access:Access;careEnabled:boolean}) {
  const schedule=`/dashboard/courses?date=${date}`;
  return <PageShell compact><PageHeader title="今日教務工作台" subtitle={`${date} · 依目前帳號與門市權限顯示`} actions={<div className="flex flex-wrap gap-2"><HomeRetry/>{access.create&&<Link className={action} href={`${schedule}&action=schedule`}>新增排課</Link>}{access.bookings&&<Link className={action} href={schedule}>完整課表</Link>}</div>}/>
    <div className="@container space-y-3">
      {access.bookings&&<Section title="今日課程" load={async()=>{
        const result=await getMusicHomeSchedule(storeId,date), next=result.rows.flatMap(r=>[new Date(r.startsAt).getTime(),new Date(r.endsAt).getTime()]).filter(n=>n>Date.now());
        return <><HomeClockRefresh nextAt={Math.min(...next,dayRange(date).end.getTime()+1)}/><p className="mb-2 text-sm text-earth-600">{result.truncated ? "顯示前 200 堂，請至完整課表查看其餘課程。" : `今日 ${result.rows.length} 堂 · 課後待點名 ${result.rows.filter(r=>r.status==="課後待點名").length} 堂`}</p><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-earth-50 text-earth-600"><tr>{["時間／課程","教師／教室","人數","狀態","操作"].map(t=><th key={t} className="px-3 py-2 font-medium">{t}</th>)}</tr></thead><tbody className="divide-y divide-earth-100">{result.rows.map(row=><tr key={row.id}><td className="px-3 py-2"><p className="font-semibold text-primary-900">{formatTWDateTime(new Date(row.startsAt)).slice(-5)}–{formatTWDateTime(new Date(row.endsAt)).slice(-5)}</p><p>{row.name}</p></td><td className="px-3 py-2"><p>{row.teacher}</p><p className="text-earth-600">{row.room}</p></td><td className="px-3 py-2 tabular-nums">{row.people} 人</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 ${row.status.includes("待") ? "bg-amber-50 text-amber-900" : "bg-earth-50 text-earth-700"}`}>{row.status}</span></td><td className="px-3 py-2"><Link className={action} href={`${schedule}&action=booking&session=${encodeURIComponent(row.id)}`}>{access.todos.attendance ? "名單／點名" : "查看名單"}</Link></td></tr>)}</tbody></table></div>{!result.rows.length&&<p className="py-3 text-sm text-earth-600">今天尚無課程，可由完整課表查看其他日期。</p>}</>;
      }}/>}
      <div className="grid items-start gap-3 @min-[54rem]:grid-cols-2">
        {(access.todos.attendance||access.todos.payments||access.todos.followUp)&&<Section title="待處理事項" load={async()=>{
          const result=await getCourseHomeTodos(storeId,access.todos,new Date(),0,8);
          return <CourseTodoList result={result} music/>;
        }}/>}
        {access.bookings&&access.customers&&access.planStatus&&<Section title="請假與補課" load={async()=>{
          const customers=(await prisma.customer.findMany({where:{...musicCustomerWhere(storeId),storeId,mergedIntoCustomerId:null,...(access.staffScope?{assignedStaffId:access.staffScope}:{})},select:{id:true,name:true}})).filter(c=>musicDataSeparationEnabled(storeId)||!testName(c.name));
          const [opening,native]=await Promise.all([getOpeningMakeupWorkspace(storeId,undefined,customers.map(c=>c.id)),getMusicLeaveWorkspace(storeId,customers)]);
          const pending=opening.rows.filter(r=>r.state==="AVAILABLE"&&(!r.expiry||r.expiry>=date));
          const expired=opening.rows.filter(r=>r.state==="AVAILABLE"&&r.expiry&&r.expiry<date);
          const nativePending=native.rows.filter(r=>r.state==="待安排"),issues=native.rows.filter(r=>r.state==="需處理");
          return <div className="space-y-2 text-sm"><p>音教雲待安排 <strong>{pending.length}</strong> 堂 · 已逾期 <strong>{expired.length}</strong> 堂</p><p>蒸管家待安排 <strong>{nativePending.length}</strong> 筆 · 需處理 <strong>{issues.length}</strong> 筆</p>{native.truncated&&<p className="text-amber-900">蒸管家僅統計最近 1,000 筆請假，請進明細依學員核對。</p>}<p className="text-earth-600">{musicDataSeparationEnabled(storeId)?"已排除核對過的舊驗收資料；明細頁可切換查看。":"隱藏名稱含驗收／測試的資料；兩種來源分開列示。"}</p><Link className={action} href="/dashboard/courses/makeups">安排補課／查看原課</Link></div>;
        }}/>}
      </div>
      {access.customers&&access.planStatus&&careEnabled&&<Section title="學員續報與期限提醒" load={async()=>{
        const result=await getCourseCustomerCare(storeId,new Date(),access.staffScope);
        const low=result.low.filter(r=>!testName(r.name)), expiring=result.expiring.filter(r=>!testName(r.name));
        const rows=[...new Map([...low,...expiring].map(r=>[r.id,r])).values()];
        return <><p className="mb-2 text-sm text-earth-600">可預約堂數達方案提醒門檻 {low.length} 人 · 14 天內到期 {expiring.length} 人；同一學員可能符合兩項。</p><ul className="divide-y divide-earth-100">{rows.slice(0,8).map(row=><li key={row.id}><Link className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-sm" href={studentHref(row.id)}><span className="font-semibold text-primary-900">{row.name}</span><span>{row.cards.filter(c=>c.low||c.expiring).map(c=>`${c.name}：可再預約 ${c.available} ${c.unit}${c.expiring&&c.expiresAt?` · ${toLocalDateStr(c.expiresAt)} 到期`:""}`).join("；")}</span><span className="text-primary-800">查看／續報 →</span></Link></li>)}</ul>{!rows.length&&<p className="py-2 text-sm">目前沒有符合已設定門檻的提醒。</p>}<div className="flex flex-wrap gap-2"><Link className={action} href={`/dashboard/growth?segment=low&month=${date.slice(0,7)}`}>全部低堂數提醒</Link><Link className={action} href={`/dashboard/growth?segment=expiring&month=${date.slice(0,7)}`}>全部到期提醒</Link></div></>;
      }}/>}
      <div className="grid items-start gap-3 @min-[54rem]:grid-cols-2">
        {access.revenue&&<Section title="今日收款" load={async()=>{const r=await getCourseReceiptTotals(storeId,date,date);return <div className="space-y-2 text-sm"><p>入帳 NT$ {r.gross.toLocaleString()} · 退款／沖銷 NT$ {(r.refunds+r.voids).toLocaleString()}</p><p>淨收款 <strong>NT$ {r.net.toLocaleString()}</strong></p><Link className={action} href={`/dashboard/revenue?summary=receipts&dateFrom=${date}&dateTo=${date}`}>查看今日收款</Link><p className="text-earth-600">待核帳不等於欠費；歷史匯入付款不重複計入今天。</p></div>;}}/>}
        {access.revenue&&access.customers&&<Section title="音教雲來源欠費核對" load={async()=>{
          const [tuition,customers]=await Promise.all([readMusicPilotTuition(coursePrisma,storeId),prisma.customer.findMany({where:{...musicCustomerWhere(storeId),storeId,mergedIntoCustomerId:null,...(access.staffScope?{assignedStaffId:access.staffScope}:{})},select:{id:true,name:true}})]);
          const names=new Map(customers.map(c=>[c.id,c.name])),visible=tuition.filter(t=>names.has(t.customerId)),debt=visible.filter(t=>t.receivable>0);
          return <div className="space-y-2 text-sm"><p>已核對 {visible.length} 位來源樣本 · 欠費 NT$ {visible.reduce((n,t)=>n+t.receivable,0).toLocaleString()}</p><p className="text-earth-600">僅已核對樣本，不代表全店欠費已完整匯入。</p>{debt.map(row=><Link key={row.customerId} className={action} href={studentHref(row.customerId,"payments")}>{names.get(row.customerId)} · NT$ {row.receivable.toLocaleString()} →</Link>)}<Link className={action} href="/dashboard/courses?view=customers">到學員付款紀錄核對</Link></div>;
        }}/>}
        <Section title="教師鐘點與月結" load={async()=>{
          if(!await checkPermission(user.role,user.staffId,"staff.view")||!await canMusicFinance(user,storeId,"teacher.settlement.read"))return <p className="text-sm text-earth-600">目前帳號未授權查看教師薪資。</p>;
          const owner=user.role==="OWNER"&&await checkPermission(user.role,user.staffId,"report.read")&&await hasStoreFeature(storeId,FEATURES.SERVICE_FEE_CALCULATOR);
          const pilot=user.role==="ADMIN"&&(await readMusicFinanceScope(user,storeId))===null&&await readMusicPilotFeeProof(coursePrisma,storeId);
          return <div className="space-y-2 text-sm"><p>{toLocalMonthStr()} · 鐘點待核對、月結與發薪狀態請以明細為準。</p><div className="flex flex-wrap gap-2"><Link className={action} href="/dashboard/teachers">教師／鐘點費設定</Link>{owner?<Link className={action} href={`/dashboard/service-fee-calculator?month=${toLocalMonthStr()}`}>本月月結／發薪紀錄</Link>:pilot?<Link className={action} href="/dashboard/courses/source-pilot/salary">樣本薪資／月結測試</Link>:<span className="text-earth-600">月結入口需對應角色與功能授權。</span>}</div>{pilot&&<p className="text-earth-600">樣本試算不代表全店應付薪資或已發薪紀錄。</p>}</div>;
        }}/>
      </div>
    </div>
  </PageShell>;
}
