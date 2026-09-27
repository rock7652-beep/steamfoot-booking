import {coursePrisma} from "@/lib/course-db";
import {getCurrentUser} from "@/lib/session";
import {checkPermission} from "@/lib/permissions";
import {courseTeacherFee} from "@/lib/course-fee-payment";
import {formatTWTime} from "@/lib/date-utils";
import {CourseFeePaymentButton,CourseFeeCorrectionButton} from "./course-fee-payment-button";

export async function CourseFees({storeId,range,readOnly}: {storeId:string;range:{gte:Date;lte:Date};readOnly:boolean}) {
  const user=await getCurrentUser();
  if(!user||user.role!=="OWNER"||!await checkPermission(user.role,user.staffId,"cashbook.read"))return null;
  const ready=await coursePrisma.$queryRaw<Array<{ready:boolean}>>`SELECT to_regclass('public."CourseFeePayment"') IS NOT NULL AS ready`;
  if(!ready[0]?.ready)return <section><h2>授課費</h2><p>授課費登錄尚未開放。</p></section>;
  const canPay=!readOnly&&await checkPermission(user.role,user.staffId,"cashbook.create");
  const rows=await coursePrisma.$queryRaw<Array<{id:string;paymentId:string|null;name:string;startsAt:Date;endsAt:Date;cancelledAt:Date|null;staffName:string;rule:unknown;amount:number|null;paidAt:Date|null;method:string|null;note:string|null;musicPricePerLesson:number|null;musicTeacherFeeBase:number|null;paidSeats:bigint;freeTrialSeats:bigint;pendingSeats:bigint}>>`
    SELECT s.id,p.id AS "paymentId",s."nameSnapshot" AS name,s."startsAt",s."endsAt",s."cancelledAt",
      COALESCE(p."staffNameSnapshot",f."displayName",'教練資料待核對') AS "staffName",c.rule,p.amount,p."createdAt" AS "paidAt",p.method,p.note,c."musicPricePerLesson",c."musicTeacherFeeBase",
      (SELECT count(*) FROM "CourseBooking" b WHERE b."sessionId"=s.id AND (b.status IN ('ATTENDED','NO_SHOW') OR b."absenceKind"='GROUP_LEAVE_FORFEITED') AND b."bookingKind"<>'TEACHER_MAKEUP' AND NOT (b."bookingKind"='TRIAL' AND c."musicTrialMode"='FREE')) AS "paidSeats",
      (SELECT count(*) FROM "CourseBooking" b WHERE b."sessionId"=s.id AND (b.status IN ('ATTENDED','NO_SHOW') OR b."absenceKind"='GROUP_LEAVE_FORFEITED') AND b."bookingKind"='TRIAL' AND c."musicTrialMode"='FREE') AS "freeTrialSeats",
      (SELECT count(*) FROM "CourseBooking" b WHERE b."sessionId"=s.id AND b.status='RESERVED') AS "pendingSeats"
    FROM "CourseSession" s LEFT JOIN "CourseCompensationSnapshot" c ON c."sessionId"=s.id AND c."storeId"=s."storeId"
    LEFT JOIN "Staff" f ON f.id=c."staffId" AND f."storeId"=s."storeId"
    LEFT JOIN "CourseFeePayment" p ON p."sessionId"=s.id AND p."storeId"=s."storeId" AND p."voidedAt" IS NULL
    WHERE s."storeId"=${storeId} AND s."startsAt">=${range.gte} AND s."startsAt"<=${range.lte}
    ORDER BY s."startsAt" DESC,s.id LIMIT 101`;
  const now=new Date();
  const summarized=rows.slice(0,100).map(row=>({row,fee:courseTeacherFee(row.rule,{paid:Number(row.paidSeats),freeTrial:Number(row.freeTrialSeats),pending:Number(row.pendingSeats)},{perLesson:row.musicPricePerLesson,freeTrialBase:row.musicTeacherFeeBase}),ended:row.endsAt<=now}));
  const pending=summarized.filter(({row,fee,ended})=>!row.paidAt&&!row.cancelledAt&&ended&&fee!==null&&fee>0).length;
  const pendingAmount=summarized.reduce((sum,{row,fee,ended})=>sum+(!row.paidAt&&!row.cancelledAt&&ended&&fee!==null&&fee>0&&Number.isSafeInteger(fee)?fee:0),0);
  return <details className="rounded-xl border border-earth-200 bg-white p-3">
    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1"><span><strong className="font-semibold">授課費</strong><span className="ml-2 text-sm text-earth-500">待核對 {pending} 堂</span></span><span className="w-full text-sm font-medium text-primary-800 sm:w-auto sm:text-right">預估 NT$ {pendingAmount.toLocaleString()}　展開明細</span></summary>
    <p className="my-2 text-sm text-earth-600">依上方日期查看課次。固定費每堂計一次；音樂課比例按實際應計學員座位核算，未完成點名須先核對。登錄已付後會同步一筆支出。</p>
    {rows.length>100&&<p role="status">僅顯示最近 100 堂，請縮短日期範圍查看其他課次。</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["課次／教練","授課費","付款狀態","處理"].map(label=><th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>
      {summarized.map(({row,fee,ended})=>{
        const status=row.paidAt?`已付 · ${formatTWTime(row.paidAt)}`:row.cancelledAt?"已取消":fee===null?"舊課次費率待核對":fee===0?"不另領授課費":!ended?"尚未結束":!Number.isSafeInteger(fee)?"小數金額待核對":"待付（請核對授課）";
        return <tr className="border-t align-top" key={row.id}><td className="p-2">{formatTWTime(row.startsAt)}<br/>{row.name} · {row.staffName}</td><td className="p-2">{fee===null?"—":`NT$ ${fee.toLocaleString()}`}</td><td className="p-2">{status}{row.paidAt&&<details><summary>付款備註</summary>{row.method==="CASH"?"現金":"非現金"} · {row.note}</details>}</td><td className="p-2">{canPay&&row.paymentId?<CourseFeeCorrectionButton paymentId={row.paymentId}/>:null}{canPay&&!row.paidAt&&!row.cancelledAt&&ended&&fee!==null&&fee>0&&Number.isSafeInteger(fee)?<CourseFeePaymentButton sessionId={row.id} amount={fee}/>:null}</td></tr>;
      })}
      {!rows.length&&<tr><td colSpan={4} className="p-3">此期間沒有課次。</td></tr>}
    </tbody></table></div>
  </details>;
}
