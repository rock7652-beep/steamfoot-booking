"use client";
import { MusicPeriodOverview } from "./music-period-overview";
import {musicPanelRead} from "@/lib/music-panel-transport";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { studentMakeupsHref, studentCourseHref } from "@/lib/music-student-navigation";
import { CourseHistoryList } from "./history-list";
import { loadCourseCustomerBookings } from "@/server/actions/course-members";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { courseBookingHistoryLabel } from "@/lib/course-booking-history-label";
import { DashboardLink } from "@/components/dashboard-link";
const readHistory:typeof loadCourseCustomerBookings=(...args)=>musicPanelRead("bookings",args,()=>loadCourseCustomerBookings(...args));
export function CourseCustomerBookings({ customerId, compact=false, music = false }: { customerId: string;compact?:boolean; music?: boolean }) {
  const [mode, setMode] = useState("upcoming");
  const params = useSearchParams();
  if(!music)return <LegacyCourseCustomerBookings customerId={customerId} compact={compact}/>;
  return <>{music && <nav aria-label="課程紀錄分類" className="flex flex-wrap gap-2">{[["upcoming","即將上課"],["history","歷史／取消紀錄"],["periods","逐期總覽"]].map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} className={`min-h-11 rounded-lg border px-3 text-sm ${mode===value ? "bg-primary-50 text-primary-800" : "text-earth-600"}`} onClick={()=>setMode(value)}>{label}</button>)}</nav>}{music && mode==="periods" ? <MusicPeriodOverview customerId={customerId}/> : <CourseHistoryList key={music ? mode : "all"} mode={music ? mode : "all"} columns={["日期／時間", "課程／額度", "出勤狀態", "方案期限", "操作"]} customerId={customerId} label={music ? "課表與出勤紀錄" : "課程預約與出席"} empty={music && mode==="upcoming" ? "尚無即將上課的預約。" : "尚無符合條件的紀錄。"} load={readHistory} render={b => <>
    <td className="tabular-nums">{formatTWDateTime(new Date(b.date))}</td>
    <td><p className="font-medium">{b.name}</p><p className="text-earth-600">{b.bookingKind === "OPENING_MAKEUP" ? "獨立補課權益" : b.unit === "TRIAL" ? "體驗・不扣額度" : `${b.points} ${b.unit === "SESSION" ? "堂" : "點"}／次`}</p></td>
    <td><span className="inline-block rounded bg-earth-50 px-2 py-1">{courseBookingHistoryLabel(b)}</span></td>
    <td>{music && b.validityDays ? `首次上課起 ${b.validityDays} 天` : b.expiresAt ? toLocalDateStr(new Date(b.expiresAt)) : "—"}</td>
    <td><div className="flex flex-wrap items-start gap-x-3"><DashboardLink className="inline-flex min-h-11 items-center text-primary-700 underline" href={music ? studentCourseHref(customerId, toLocalDateStr(new Date(b.date)), b.sessionId, params.toString()) : `/dashboard/courses?date=${toLocalDateStr(new Date(b.date))}&action=booking&session=${encodeURIComponent(b.sessionId)}`}>課堂／點名</DashboardLink>
      <details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">明細</summary>
        <p>方案：{b.plan}</p><p>操作人：{b.operator}</p><p>備註：{b.notes || "無"}</p>
        {music && (b.absenceKind === "STUDENT_LEAVE" || b.bookingKind === "OPENING_MAKEUP") && <DashboardLink className="inline-flex min-h-11 items-center text-primary-700 underline" href={studentMakeupsHref(customerId, params.toString())}>查看補課進度</DashboardLink>}
      </details>
    </div></td>
  </>} />}</>;
}

function LegacyCourseCustomerBookings({ customerId, compact=false }: { customerId: string;compact?:boolean }) {
  const params=useSearchParams();
  return <CourseHistoryList compact={compact} customerId={customerId} label="課程預約與出席" empty="尚無上課紀錄" load={loadCourseCustomerBookings} render={b=>compact?<details>
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-1">
        <span className="shrink-0 text-earth-500">{formatTWDateTime(new Date(b.date))}</span><span className="min-w-0 flex-1 font-medium">{b.name}</span>
        <span>{b.coachName??""}</span><span>{b.status==="ATTENDED"?"出席":b.status==="NO_SHOW"?"曠課":b.absenceKind==="STUDENT_LEAVE"?"請假":b.status==="CANCELLED"?"已取消":b.checkedIn?"已報到":"待點名"}</span>
        <span>{b.points>0?`${["ATTENDED","NO_SHOW"].includes(b.status)||b.absenceKind==="GROUP_LEAVE_FORFEITED"?"已扣":"本堂"} ${b.points} ${b.unit==="SESSION"?"堂":"點"}`:"未扣抵"}</span><span aria-hidden="true">⌄</span>
      </summary><div className="space-y-1 border-t border-earth-100 py-2 text-earth-600"><DashboardLink className="inline-flex min-h-11 items-center text-primary-700 underline" href={studentCourseHref(customerId,toLocalDateStr(new Date(b.date)),b.sessionId,new URLSearchParams({...Object.fromEntries(params),studentTab:"records"}).toString())}>課堂／點名</DashboardLink><p>{b.plan}{b.expiresAt?` · 到期 ${formatTWDateTime(new Date(b.expiresAt)).slice(0,10)}`:""}</p><p>操作人：{b.operator||"未記錄"}{b.notes?` · ${b.notes}`:""}</p></div>
    </details>:<><p className="font-medium">{formatTWDateTime(new Date(b.date))} · {b.name}</p><p>{b.unit === "TRIAL" ? ({ATTENDED:"已出席",CANCELLED:"已取消",NO_SHOW:"未到",RESERVED:b.checkedIn?"已報到":"待出席"}[b.status]??b.status) : b.status === "ATTENDED" ? "已完成／已使用額度" : b.status === "CANCELLED" ? "已取消／已釋放" : b.status === "NO_SHOW" ? "未到／已釋放" : b.checkedIn ? "已報到／占用中" : "未報到／占用中"} · {b.unit === "TRIAL" ? "體驗不使用方案額度" : `${b.points} ${b.unit === "SESSION" ? "堂" : "點"}`}</p><p>{b.plan}{b.expiresAt ? ` · 到期 ${formatTWDateTime(new Date(b.expiresAt)).slice(0,10)}` : ""}</p><details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">預約明細</summary><p>操作人：{b.operator} · 預約備註：{b.notes || "無"}</p></details></>}/>;
}
