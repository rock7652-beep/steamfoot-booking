import {isMusicFinanceStore,canMusicFinance,readMusicFinanceScope} from "@/server/services/music-finance-access";
import {coursePrisma} from "@/lib/course-db";
import {getCurrentUser} from "@/lib/session";
import {checkPermission} from "@/lib/permissions";
import {capturedTeacherFee,readTeacherFeeSeats,type CapturedTeacherFee} from "@/server/services/course-teacher-fee";
import {formatTWTime} from "@/lib/date-utils";
import {CourseFeePaymentButton,CourseFeeCorrectionButton} from "./course-fee-payment-button";

export async function CourseFees({storeId,range,readOnly}: {storeId:string;range:{gte:Date;lte:Date};readOnly:boolean}) {
  const user=await getCurrentUser();
  if(!user||user.role!=="OWNER"||!await checkPermission(user.role,user.staffId,"cashbook.read"))return null;
  if(!await canMusicFinance(user,storeId,"teacher.settlement.read"))return null;
  const music=await isMusicFinanceStore(storeId);
  const scope=await readMusicFinanceScope(user,storeId);
  const ready=await coursePrisma.$queryRaw<Array<{ready:boolean}>>`SELECT to_regclass('public."CourseFeePayment"') IS NOT NULL AS ready`;
  if(!ready[0]?.ready)return <section><h2>授課費</h2><p>授課費登錄尚未開放。</p></section>;
  const canPay=!readOnly&&await canMusicFinance(user,storeId,"teacher.settlement.pay")&&await checkPermission(user.role,user.staffId,"cashbook.create");
  const rows=await coursePrisma.$queryRaw<Array<{id:string;paymentId:string|null;name:string;startsAt:Date;endsAt:Date;cancelledAt:Date|null;staffName:string;rule:unknown;amount:number|null;paidAt:Date|null;method:string|null;note:string|null;musicPricePerLesson:number|null;musicTeacherFeeBase:number|null;paidSeats:bigint;freeTrialSeats:bigint;pendingSeats:bigint}&CapturedTeacherFee>>`
    SELECT s.id,p.id AS "paymentId",s."nameSnapshot" AS name,s."startsAt",s."endsAt",s."cancelledAt",s."teacherAttendance",c.revision,
      COALESCE(f."displayName",${music ? '教師資料待核對' : '教練資料待核對'}) AS "staffName",c.rule,p.amount,p."paidAt",p.method,p.note,c."musicPricePerLesson",c."musicTeacherFeeBase",c."musicTrialMode"
    FROM "CourseSession" s LEFT JOIN "CourseCompensationSnapshot" c ON c."sessionId"=s.id AND c."storeId"=s."storeId"
    LEFT JOIN "Staff" f ON f.id=c."staffId" AND f."storeId"=s."storeId"
    LEFT JOIN LATERAL (SELECT (array_agg(id ORDER BY "createdAt" DESC,id DESC))[1] AS id,sum(amount)::int AS amount,max("createdAt") AS "paidAt",(array_agg(method ORDER BY "createdAt" DESC,id DESC))[1] AS method,(array_agg(note ORDER BY "createdAt" DESC,id DESC))[1] AS note FROM "CourseFeePayment" WHERE "sessionId"=s.id AND "storeId"=s."storeId" AND "voidedAt" IS NULL) p ON true
    WHERE s."storeId"=${storeId} AND s."startsAt">=${range.gte} AND s."startsAt"<=${range.lte} AND (${scope===null} OR c."staffId"=ANY(${scope??[]}::text[]))
    ORDER BY s."startsAt" DESC,s.id LIMIT 101`;
  const now=new Date();
  const feeSeats=await readTeacherFeeSeats(coursePrisma,storeId,rows.slice(0,100).map(s=>s.id));
  const summarized=rows.slice(0,100).map(row=>({row,fee:capturedTeacherFee(row,feeSeats.get(row.id)??[]).amount,ended:row.endsAt<=now}));
  const pending=summarized.filter(({row,fee,ended})=>!row.cancelledAt&&ended&&fee!==null&&fee>(row.amount??0)).length;
  const pendingAmount=summarized.reduce((sum,{row,fee,ended})=>sum+(!row.cancelledAt&&ended&&fee!==null&&fee>(row.amount??0)&&Number.isSafeInteger(fee)?fee-(row.amount??0):0),0);
  return <details className="rounded-xl border border-earth-200 bg-white p-3">
    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1"><span><strong className="font-semibold">授課費</strong><span className="ml-2 text-sm text-earth-500">待核對 {pending} 堂</span></span><span className="w-full text-sm font-medium text-primary-800 sm:w-auto sm:text-right">預估 NT$ {pendingAmount.toLocaleString()}　展開明細</span></summary>
    <p className="my-2 text-sm text-earth-600">依上方日期查看課次。固定費每堂計一次；音樂課比例按實際應計學員座位核算，未完成點名須先核對。登錄已付後會同步一筆支出。</p>
    {rows.length>100&&<p role="status">僅顯示最近 100 堂，請縮短日期範圍查看其他課次。</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{[music ? "課次／教師" : "課次／教練","授課費","付款狀態","處理"].map(label=><th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>
      {summarized.map(({row,fee,ended})=>{
        const status=row.paidAt?`已付 NT$ ${(row.amount??0).toLocaleString()} · ${fee===null?"待核對":`未付 NT$ ${Math.max(0,fee-(row.amount??0)).toLocaleString()}`}`:row.cancelledAt?"已取消":fee===null?"舊課次費率待核對":fee===0?"不另領授課費":!ended?"尚未結束":!Number.isSafeInteger(fee)?"小數金額待核對":"待付（請核對授課）";
        return <tr className="border-t align-top" key={row.id}><td className="p-2">{formatTWTime(row.startsAt)}<br/>{row.name} · {row.staffName}</td><td className="p-2">{fee===null?"—":`NT$ ${fee.toLocaleString()}`}</td><td className="p-2">{status}{row.paidAt&&<details><summary>付款備註</summary>{row.method==="CASH"?"現金":"非現金"} · {row.note}</details>}</td><td className="p-2">{canPay&&row.paymentId?<CourseFeeCorrectionButton paymentId={row.paymentId}/>:null}{canPay&&!row.cancelledAt&&ended&&fee!==null&&fee>(row.amount??0)&&Number.isSafeInteger(fee)?<CourseFeePaymentButton sessionId={row.id} amount={fee} paid={row.amount??0}/>:null}</td></tr>;
      })}
      {!rows.length&&<tr><td colSpan={4} className="p-3">此期間沒有課次。</td></tr>}
    </tbody></table></div>
  </details>;
}
