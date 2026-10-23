"use client";
import { CourseHistoryList } from "./history-list";
import { loadCourseCustomerBookings } from "@/server/actions/course-members";
import { formatTWDateTime } from "@/lib/date-utils";
type HistoryRow=Extract<Awaited<ReturnType<typeof loadCourseCustomerBookings>>,{success:true}>['data'][number]&{service?:{debit:boolean;isTrial:boolean}};
export type CustomerBookingHistoryReader=(customerId:string,offset?:number,range?:{from?:string;to?:string})=>Promise<{success:true;hasMore:boolean;data:HistoryRow[]}|{success:false;error:string}>;
export function CourseCustomerBookings({load=loadCourseCustomerBookings,sessionUnitLabel="堂",serviceMode=false, customerId, compact=false }: {load?:CustomerBookingHistoryReader;sessionUnitLabel?:string;serviceMode?:boolean; customerId: string;compact?:boolean }) {
  return <CourseHistoryList compact={compact} customerId={customerId} label={serviceMode?"預約與服務紀錄":"課程預約與出席"} empty={serviceMode?"尚無服務紀錄":"尚無上課紀錄"} load={load} render={b=>compact?<details>
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-1">
        <span className="shrink-0 text-earth-500">{formatTWDateTime(new Date(b.date))}</span><span className="min-w-0 flex-1 font-medium">{b.name}</span>
        <span>{b.coachName??""}</span><span>{b.status==="ATTENDED"?serviceMode?"已完成":"出席":b.status==="NO_SHOW"?serviceMode?"未到":"曠課":b.absenceKind==="STUDENT_LEAVE"?"請假":b.status==="CANCELLED"?"已取消":b.checkedIn?"已報到":serviceMode?"已預約":"待點名"}</span>
        <span>{b.service?(b.points>0?b.service.debit?`已扣 ${b.points} ${sessionUnitLabel}`:b.status==='RESERVED'?`保留 ${b.points} ${sessionUnitLabel}`:'未扣次':b.service.isTrial?'體驗服務':'單次服務'):b.points>0?`${["ATTENDED","NO_SHOW"].includes(b.status)||b.absenceKind==="GROUP_LEAVE_FORFEITED"?"已扣":"本堂"} ${b.points} ${b.unit==="SESSION"?sessionUnitLabel:"點"}`:"未扣抵"}</span><span aria-hidden="true">⌄</span>
      </summary><div className="space-y-1 border-t border-earth-100 py-2 text-earth-600"><p>{b.plan}{b.expiresAt?` · 到期 ${formatTWDateTime(new Date(b.expiresAt)).slice(0,10)}`:""}</p><p>操作人：{b.operator||"未記錄"}{b.notes?` · ${b.notes}`:""}</p></div>
    </details>:<><p className="font-medium">{formatTWDateTime(new Date(b.date))} · {b.name}</p><p>{b.unit === "TRIAL" ? ({ATTENDED:"已出席",CANCELLED:"已取消",NO_SHOW:"未到",RESERVED:b.checkedIn?"已報到":"待出席"}[b.status]??b.status) : b.status === "ATTENDED" ? "已完成／已使用額度" : b.status === "CANCELLED" ? "已取消／已釋放" : b.status === "NO_SHOW" ? "未到／已釋放" : b.checkedIn ? "已報到／占用中" : "未報到／占用中"} · {b.unit === "TRIAL" ? "體驗不使用方案額度" : `${b.points} ${b.unit === "SESSION" ? sessionUnitLabel : "點"}`}</p><p>{b.plan}{b.expiresAt ? ` · 到期 ${formatTWDateTime(new Date(b.expiresAt)).slice(0,10)}` : ""}</p><details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">預約明細</summary><p>操作人：{b.operator} · 預約備註：{b.notes || "無"}</p></details></>}/>;
}
