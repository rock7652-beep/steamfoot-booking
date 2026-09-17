import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { courseManager } from "@/server/services/course-access";
import { getSteamButlerLineAccessToken } from "@/lib/line-config";
import { probeSteamButlerLineRecipient } from "@/lib/line";

// Temporary, explicitly authorized acceptance run. No user-supplied recipient/content.
// Remove after the one approved batch. Normal preview cron delivery remains blocked.
const STORE = "course-e2e-20260916";
const CUSTOMER = "cmu45wdzt0002lb042pwa55wd";
const RUN = "course-approved-line-20260918";
const RETRY_KEY = "446a24e3-2725-4475-af8f-d8b97317c993";
const TEXTS = [
  "【隔離測試】課程提醒呈現驗收，非真實預約，無須到課或付款。",
  "【隔離測試／示意資料】測試方案剩餘 7 點、預約占用 3 點、可用 4 點。占用尚未正式扣點。",
  "【隔離測試／示意資料】測試方案到期日 2026/09/30。此訊息不代表您的真實方案或期限。",
];
function previewOnly() {
  if (process.env.VERCEL_ENV !== "preview" || Date.now() >= Date.parse("2026-09-20T00:00:00+08:00")) notFound();
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (!(url.hostname === "db.ttworfzgwejdeolegkxl.supabase.co" || (url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username) === "postgres.ttworfzgwejdeolegkxl"))) notFound();
}
async function sendApprovedBatch() {
  "use server";
  previewOnly();
  const { storeId, user } = await courseManager("business_hours.manage");
  if (storeId !== STORE || user.role !== "OWNER") notFound();
  const person = await prisma.customer.findFirst({where:{id:CUSTOMER,storeId,mergedIntoCustomerId:null},include:{identityLinks:true}});
  const recipient = person?.lineUserId;
  if (!person || !recipient?.endsWith("7d50fa") || person.lineLinkStatus !== "LINKED" || !person.identityLinks.some(link => link.lineUserId === recipient)) throw new Error("指定收件人的固定身分連結不符，未發送");
  const token = getSteamButlerLineAccessToken();
  if (!token) throw new Error("中央 LINE 權杖未設定，未發送");
  const probe = await probeSteamButlerLineRecipient(recipient);
  if (probe.status !== "COMPATIBLE") throw new Error("指定收件人無法由中央 LINE 通道驗證，未發送");
  const ids = TEXTS.map((_,i)=>`${RUN}:${i}`);
  const claimed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
    if (await tx.messageLog.count({where:{id:{in:ids}}})) return false;
    await tx.messageLog.createMany({data:TEXTS.map((body,i)=>({id:ids[i],storeId,customerId:CUSTOMER,channel:"LINE",lineRoute:"CENTRAL",status:"PENDING",renderedBody:body,errorMessage:"使用者核准的三則通道驗收；不代表事件觸發"}))});
    return true;
  });
  if (claimed) {
    // Persist claim before network I/O: timeout/crash never permits a second batch.
    let accepted = false;
    let outcome = "結果未確認；禁止自動重送，先查 LINE 請求紀錄";
    try {
      const response = await fetch("https://api.line.me/v2/bot/message/push",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-Line-Retry-Key":RETRY_KEY},body:JSON.stringify({to:recipient,messages:TEXTS.map(text=>({type:"text",text}))}),signal:AbortSignal.timeout(10000)});
      accepted = response.ok;
      outcome = `LINE HTTP ${response.status}; request ${response.headers.get("x-line-request-id") ?? "unknown"}; API 接受不代表使用者收到`;
    } catch { /* Keep durable claim even if delivery outcome is unknown. */ }
    await prisma.messageLog.updateMany({where:{id:{in:ids},storeId},data:{status:accepted?"SENT":"FAILED",sentAt:accepted?new Date():null,errorMessage:outcome}});
  }
  revalidatePath("/dashboard/courses/notification-acceptance");
}
export default async function ApprovedNotificationAcceptance() {
  const user = await getCurrentUser();
  if (!user || user.role !== "OWNER" || !(await checkPermission(user.role,user.staffId,"business_hours.manage"))) notFound();
  previewOnly();
  const {storeId}=await courseManager("business_hours.manage");
  if(storeId!==STORE) notFound();
  const logs=await prisma.messageLog.findMany({where:{storeId,id:{startsWith:`${RUN}:`}},orderBy:{id:"asc"}});
  return <main className="mx-auto max-w-2xl space-y-4 p-4"><h1 className="text-xl font-bold">已授權的三則 LINE 隔離驗收</h1><p>僅固定測試會員（LINE 末碼 7d50fa）。不新增預約、不扣點、不修改綁定。共三則，整批只允許嘗試一次。</p><ol className="list-decimal space-y-3 pl-6">{TEXTS.map(text=><li key={text}>{text}</li>)}</ol>{logs.length ? <section aria-label="發送結果">{logs.map(log=><p key={log.id}>{log.status}：{log.errorMessage}</p>)}</section> : <form action={sendApprovedBatch}><button className="min-h-11 rounded bg-emerald-800 px-4 py-3 text-white">發送已核准三則</button></form>}<p>API 接受與實際收到／呈現分開記錄；不代表課程事件觸發驗收。</p></main>;
}
