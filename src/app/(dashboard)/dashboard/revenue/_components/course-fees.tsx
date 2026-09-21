import {coursePrisma} from "@/lib/course-db";
import {getCurrentUser} from "@/lib/session";
import {checkPermission} from "@/lib/permissions";
import {fixedCourseFee} from "@/lib/course-fee-payment";
import {formatTWTime} from "@/lib/date-utils";
import {CourseFeePaymentButton,CourseFeeCorrectionButton} from "./course-fee-payment-button";

export async function CourseFees({storeId,range,readOnly}: {storeId:string;range:{gte:Date;lte:Date};readOnly:boolean}) {
  const user=await getCurrentUser();
  if(!user||user.role!=="OWNER"||!await checkPermission(user.role,user.staffId,"cashbook.read"))return null;
  const ready=await coursePrisma.$queryRaw<Array<{ready:boolean}>>`SELECT to_regclass('public."CourseFeePayment"') IS NOT NULL AS ready`;
  if(!ready[0]?.ready)return <section><h2>授課費</h2><p>授課費登錄尚未開放。</p></section>;
  const canPay=!readOnly&&await checkPermission(user.role,user.staffId,"cashbook.create");
  const rows=await coursePrisma.$queryRaw<Array<{id:string;paymentId:string|null;name:string;startsAt:Date;endsAt:Date;cancelledAt:Date|null;staffName:string;rule:unknown;amount:number|null;paidAt:Date|null;method:string|null;note:string|null}>>`
    SELECT s.id,p.id AS "paymentId",s."nameSnapshot" AS name,s."startsAt",s."endsAt",s."cancelledAt",
      COALESCE(p."staffNameSnapshot",f."displayName",'教練資料待核對') AS "staffName",c.rule,p.amount,p."createdAt" AS "paidAt",p.method,p.note
    FROM "CourseSession" s LEFT JOIN "CourseCompensationSnapshot" c ON c."sessionId"=s.id AND c."storeId"=s."storeId"
    LEFT JOIN "Staff" f ON f.id=c."staffId" AND f."storeId"=s."storeId"
    LEFT JOIN "CourseFeePayment" p ON p."sessionId"=s.id AND p."storeId"=s."storeId" AND p."voidedAt" IS NULL
    WHERE s."storeId"=${storeId} AND s."startsAt">=${range.gte} AND s."startsAt"<=${range.lte}
    ORDER BY s."startsAt" DESC,s.id LIMIT 101`;
  return <section className="rounded-xl border border-earth-200 bg-white p-3">
    <h2 className="font-semibold">授課費</h2>
    <p className="my-2 text-sm">依上方日期查看課次。每堂固定一次；設定 0 元表示不另領授課費。登錄已付後會同步一筆支出。</p>
    {rows.length>100&&<p role="status">僅顯示最近 100 堂，請縮短日期範圍查看其他課次。</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["課次／教練","固定授課費","付款狀態","處理"].map(label=><th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>
      {rows.slice(0,100).map(row=>{
        const fee=fixedCourseFee(row.rule), ended=row.endsAt<=new Date();
        const status=row.paidAt?`已付 · ${formatTWTime(row.paidAt)}`:row.cancelledAt?"已取消":fee===null?"舊課次費率待核對":fee===0?"不另領授課費":!ended?"尚未結束":!Number.isSafeInteger(fee)?"小數金額待核對":"待付（請核對授課）";
        return <tr className="border-t align-top" key={row.id}><td className="p-2">{formatTWTime(row.startsAt)}<br/>{row.name} · {row.staffName}</td><td className="p-2">{fee===null?"—":`NT$ ${fee.toLocaleString()}`}</td><td className="p-2">{status}{row.paidAt&&<details><summary>付款備註</summary>{row.method==="CASH"?"現金":"非現金"} · {row.note}</details>}</td><td className="p-2">{canPay&&row.paymentId?<CourseFeeCorrectionButton paymentId={row.paymentId}/>:null}{canPay&&!row.paidAt&&!row.cancelledAt&&ended&&fee!==null&&fee>0&&Number.isSafeInteger(fee)?<CourseFeePaymentButton sessionId={row.id} amount={fee}/>:null}</td></tr>;
      })}
      {!rows.length&&<tr><td colSpan={4} className="p-3">此期間沒有課次。</td></tr>}
    </tbody></table></div>
  </section>;
}
