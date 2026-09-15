import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { FEATURES } from "@/lib/feature-flags";
import { hasCurrentStoreFeature } from "@/lib/feature-gate";

export type CourseHubView = "settings" | "operations" | "analytics";
const card = "rounded-2xl border border-earth-200 bg-white p-5 sm:p-6";
function Entry({title, description, href, action = "開啟"}: {title:string; description:string; href:string; action?:string}) {
  return <section className={card}><h2 className="text-lg font-semibold text-primary-900">{title}</h2><p className="mt-2 text-sm leading-relaxed text-earth-500">{description}</p><Link href={href} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary-50 px-4 text-sm font-medium text-primary-700 hover:bg-primary-100">{action} →</Link></section>;
}
function Pending({children}: {children:React.ReactNode}) {
  return <section className="rounded-xl border border-earth-200 bg-earth-50 p-5"><h2 className="text-sm font-medium text-earth-700">尚未接通的功能</h2><p className="mt-2 text-sm leading-relaxed text-earth-500">{children}</p></section>;
}
export async function CourseSharedHub({view}: {view:CourseHubView}) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const permission = view === "analytics" ? "report.read" : view === "operations" ? "cashbook.read" : "booking.read";
  if (!(await checkPermission(user.role, user.staffId, permission))) notFound();
  if (view === "settings" && !["ADMIN", "OWNER", "PARTNER"].includes(user.role)) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || await getStoreIndustryModule(storeId) !== "course") notFound();
  const title = view === "settings" ? "設定" : view === "operations" ? "營運" : "分析";
  const subtitle = view === "settings" ? "集中管理課程、人員與店家資訊" : view === "operations" ? "管理店內收支，與課程報名及扣點分開核對" : "以已排定的課程資料了解排課狀況";
  let body: React.ReactNode;
  if (view === "settings") {
    const [store, canStaff] = await Promise.all([
      prisma.store.findUnique({where:{id:storeId},select:{name:true,slug:true}}),
      checkPermission(user.role,user.staffId,"staff.view"),
    ]);
    body = <><section className={card}><h2 className="text-sm font-medium text-earth-500">目前店家</h2><p className="mt-2 text-xl font-semibold text-primary-900">{store?.name}</p><p className="mt-1 text-sm text-earth-500">店家代碼：{store?.slug}</p><p className="mt-3 text-xs text-earth-500">目前提供資訊核對；店家資料編輯尚未接入。</p></section><div className="grid gap-4 lg:grid-cols-2"><Entry title="課程與教室" description="調整課程名稱、時長、人數、點數與預設教室。" href="/dashboard/courses?view=catalog" action="課程設定" /><Entry title="上課空間" description="新增或編輯教室，排課時直接選用。" href="/dashboard/courses?view=rooms" action="教室管理" />{canStaff && <Entry title="人員與帳號權限" description="管理教練基本資料；權限編輯依登入角色開放。" href="/dashboard/staff" action="人員管理" />}</div><Pending>顧客預約／取消規則與課程通知仍待報名流程接通；這裡不套用蒸足的時段與扣堂設定。</Pending></>;
  } else if (view === "operations") {
    const enabled = await hasCurrentStoreFeature(FEATURES.CASHBOOK);
    body = <><Entry title="現金收支" description={enabled ? "開啟既有收支工作台，查閱紀錄與登記收支；可用操作依角色權限顯示。" : "現金收支需基本版以上，目前店家尚未開通。入口保留，既有方案限制不變。"} href="/dashboard/cashbook" action={enabled ? "管理收支" : "查看使用資格"} /><Pending>課程方案銷售、報名收款、退款及點數流水尚未接通。現金帳不是課程營收報表，請勿用排課堂數推算實收。</Pending></>;
  } else if (!(await hasCurrentStoreFeature(FEATURES.BASIC_REPORTS))) {
    body = <section className={card}><h2 className="text-lg font-semibold text-primary-900">目前方案尚未開通分析</h2><p className="mt-2 text-sm text-earth-500">沿用既有分析功能方案限制，不因課程模組新增入口而自動解鎖。</p><p className="mt-4 text-sm text-earth-600">開通後提供本月排課堂數、排定授課時數與教練排課量；不含尚未接通的報名及出席數據。</p></section>;
  } else {
    const month = toLocalMonthStr(), bounds = monthRange(month);
    const [sessions,staff] = await Promise.all([
      coursePrisma.courseSession.findMany({where:{storeId,cancelledAt:null,startsAt:{gte:bounds.start,lte:bounds.end}},select:{coachId:true,startsAt:true,endsAt:true}}),
      prisma.staff.findMany({where:{storeId},select:{id:true,displayName:true}}),
    ]);
    const minutes = sessions.reduce((sum,s) => sum + (s.endsAt.getTime()-s.startsAt.getTime())/60000,0);
    const counts = new Map<string,number>();
    for (const s of sessions) counts.set(s.coachId,(counts.get(s.coachId) ?? 0)+1);
    body = <><p className="text-sm text-earth-600">{month} · 依台灣時間計算，排除已取消課程，包含本月尚未上課的排程。</p><div className="grid gap-4 sm:grid-cols-3">{[["已排課堂數",sessions.length,"堂"],["排定授課時數",Math.round(minutes/60*10)/10,"小時"],["排課教練",counts.size,"位"]].map(([label,value,unit])=><section key={String(label)} className={card}><h2 className="text-sm text-earth-500">{label}</h2><p className="mt-3 text-3xl font-semibold tabular-nums text-primary-900">{value}<span className="ml-2 text-sm font-normal text-earth-500">{unit}</span></p></section>)}</div><section className={card}><h2 className="font-semibold text-primary-900">教練排課量</h2>{counts.size ? <ul className="mt-4 divide-y divide-earth-100">{[...counts].sort((a,b)=>b[1]-a[1]).map(([id,count])=><li key={id} className="flex justify-between gap-4 py-3 text-sm"><span>{staff.find(s=>s.id===id)?.displayName ?? "已移除的人員"}</span><span className="font-medium tabular-nums">{count} 堂</span></li>)}</ul> : <p className="mt-3 text-sm text-earth-500">本月尚未排課。</p>}</section><Pending>報名人數、滿班率、出席率、熱門課程與實收營收尚無完整資料，暫不顯示。</Pending></>;
  }
  return <PageShell><PageHeader title={title} subtitle={subtitle}/><div className="space-y-5">{body}</div></PageShell>;
}
