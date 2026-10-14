import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { PageShell,PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { readMusicOperationalPilot } from "@/server/services/music-operational-pilot";
import { toLocalDateStr } from "@/lib/date-utils";
import { PilotCommit } from "./pilot-commit";
import { AppError } from "@/lib/errors";
import { ZodError } from "zod";
type Cell={text:string};
type FeeHistory={groups:{periods:{fee:string[];payments:{tables:Cell[][][]}[];lessons:{tables:Cell[][][]}[]}[]}[]};
export default async function SourcePilotPage(){
  const user=await getCurrentUser();
  if(!user||!await checkPermission(user.role,user.staffId,"customer.read")||!await checkPermission(user.role,user.staffId,"booking.read")||!await checkPermission(user.role,user.staffId,"wallet.read"))notFound();
  let data;try{data=await readMusicOperationalPilot();}catch(error){
    console.error("[music-pilot-read]",error instanceof ZodError?error.issues.map(i=>({path:i.path,message:i.message})):error instanceof AppError?error.message:error instanceof Error?error.name:"UNKNOWN");
    return <PageShell><PageHeader title="音教雲十人樣本核對"/><p role="alert" className="text-sm text-red-700">{error instanceof AppError?error.message:"來源資料暫未完成讀取，請稍後重新讀取。"}</p><DashboardLink href="/dashboard/courses">返回課表</DashboardLink></PageShell>;
  }
  const money=(n:number)=>new Intl.NumberFormat("zh-TW").format(n);
  return <PageShell className="w-full min-w-0">
    <PageHeader title="音教雲十人樣本核對" subtitle="來源核對日 2026/10/14・舊付款與簽到保留原日期" actions={<DashboardLink href="/dashboard/courses">返回課表</DashboardLink>}/>
    <div className="flex flex-wrap gap-3 text-sm"><span className="rounded border p-3">10 位學生・14 筆學費</span><span className="rounded border p-3">來源實收 NT$ 33,320・欠款 NT$ 0</span><span className="rounded border p-3">普通餘堂 63・待補課 1・待體驗 1</span><span className="rounded border p-3">{data.imported?"已銜接可操作資料":"來源已核對，待銜接"}</span></div>
    <p className="text-sm text-gray-600">請假扣堂另給補課，曠課扣堂；補課沿用原期限。團班首次上課起算 70 天；個別課四期共用 2027/2/25。來源歷史不重複扣堂，也不加入今日收款。教師授課費仍待核對。</p>
    <PilotCommit imported={data.imported}/>
    <div className="max-w-full overflow-x-auto rounded border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-50"><tr>{["學生","普通剩餘／體驗","已排普通課","補課","應收／實收","期限","操作"].map(t=><th key={t} className="p-3 font-medium">{t}</th>)}</tr></thead><tbody>
      {data.payload.students.map(s=>{
        const history=data.payload.histories.find(h=>h.studentId===s.id)!.fees as FeeHistory;
        const periods=history.groups.flatMap(g=>g.periods);const amount=periods.reduce((n,p)=>n+Number(p.fee[3].replaceAll(",","")),0);const paid=periods.reduce((n,p)=>n+Number(p.fee[5].replaceAll(",","")),0);
        const ordinary=data.cards.filter(c=>c.customerId===s.customerId&&!c.makeup&&!c.closed);const makeups=data.cards.filter(c=>c.customerId===s.customerId&&c.makeup&&!c.closed);
        const bookings=data.bookings.filter(b=>b.customerId===s.customerId&&b.status==="RESERVED");const first=bookings[0];const isPrivate=data.payload.opening.enrollments.some(e=>e.mapping.customerId===s.customerId);const isGroup=data.payload.groups.some(g=>g.studentId===s.id);
        const originalRemaining=isPrivate?15:isGroup?8:s.name==="陳琋玥"?1:0;const remaining=data.imported?ordinary.reduce((n,c)=>n+c.remaining,0):originalRemaining;
        return <tr key={s.customerId} className="border-t align-top"><td className="p-3 font-medium">{s.name}</td><td className="p-3">{isPrivate||isGroup?`${remaining} 堂`:`體驗 ${data.imported?bookings.filter(b=>b.kind==="TRIAL").length:originalRemaining} 堂`}</td><td className="p-3">{bookings.filter(b=>b.kind==="CARD").length} 堂</td><td className="p-3">{isPrivate?<DashboardLink href={`/dashboard/courses/opening-makeups?customerId=${s.customerId}`} className="inline-flex min-h-11 items-center underline">原請假補課</DashboardLink>:"—"}{makeups.length>0&&<p>測試新請假補課 {makeups.reduce((n,c)=>n+c.remaining,0)} 堂</p>}</td><td className="p-3">{money(amount)}／{money(paid)}</td><td className="p-3">{isPrivate?"2027/2/25（四期共用）":isGroup?"首次上課起算 70 天":"一次體驗"}{ordinary[0]?.activated&&ordinary[0].expiresAt&&<p className="text-gray-500">{toLocalDateStr(new Date(ordinary[0].expiresAt))}</p>}</td><td className="p-3">{first?<DashboardLink className="inline-flex min-h-11 items-center underline" href={`/dashboard/courses?date=${toLocalDateStr(new Date(first.date))}&action=booking&session=${first.sessionId}`}>查看課堂／點名</DashboardLink>:"尚無待上課"}</td></tr>;
      })}
    </tbody></table></div>
    <h2 className="text-base font-semibold">學費、付款與歷史簽到</h2>
    {data.payload.students.map(s=>{
      const history=data.payload.histories.find(h=>h.studentId===s.id)!.fees as FeeHistory;
      return <details key={s.customerId} className="rounded border"><summary className="cursor-pointer p-3 text-sm font-medium">{s.name}｜查看來源紀錄</summary><div className="space-y-3 p-3 text-sm">
        {history.groups.flatMap(g=>g.periods).map((p,i)=><div key={i} className="rounded bg-gray-50 p-3"><p className="font-medium">{p.fee[2]}・第 {p.fee[0]} 期・原顯示期限 {p.fee[1].trim()}</p><p>應收 {p.fee[3]}・实收 {p.fee[5]}・欠款 {p.fee[6]}</p><p className="mt-2 font-medium">付款紀錄</p>{p.payments[0].tables[0].slice(1).length?p.payments[0].tables[0].slice(1).map((r,j)=><p key={j}>{r.slice(0,5).map(c=>c.text).join("｜")}</p>):<p>無付款紀錄（來源應收為 0）</p>}<p className="mt-2 font-medium">簽到／請假</p>{p.lessons[0].tables[1].slice(1).length?p.lessons[0].tables[1].slice(1).map((r,j)=><p key={j}>{r.slice(0,3).map(c=>c.text).filter(Boolean).join("｜")}</p>):<p>尚無簽到或請假</p>}</div>)}
      </div></details>;
    })}
  </PageShell>;
}
