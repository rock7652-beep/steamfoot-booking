"use client";
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
export function CourseCustomerBookings({ customerId, music = false }: { customerId: string; music?: boolean }) {
  const [mode, setMode] = useState("upcoming");
  const params = useSearchParams();
  return <>{music && <nav aria-label="課程紀錄分類" className="flex flex-wrap gap-2">{[["upcoming","即將上課"],["history","歷史／取消紀錄"]].map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} className={`min-h-11 rounded-lg border px-3 text-sm ${mode===value ? "bg-primary-50 text-primary-800" : "text-earth-600"}`} onClick={()=>setMode(value)}>{label}</button>)}</nav>}<CourseHistoryList key={music ? mode : "all"} mode={music ? mode : "all"} columns={["日期／時間", "課程／額度", "出勤狀態", "方案期限", "操作"]} customerId={customerId} label={music ? "課表與出勤紀錄" : "課程預約與出席"} empty={music && mode==="upcoming" ? "尚無即將上課的預約。" : "尚無符合條件的紀錄。"} load={readHistory} render={b => <>
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
  </>} /></>;
}
