"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { studentMakeupsHref, studentCourseHref } from "@/lib/music-student-navigation";
import { CourseHistoryList } from "./history-list";
import { loadCourseCustomerBookings } from "@/server/actions/course-members";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { courseBookingHistoryLabel } from "@/lib/course-booking-history-label";
import { DashboardLink } from "@/components/dashboard-link";
export function CourseCustomerBookings({ customerId, music = false }: { customerId: string; music?: boolean }) {
  const [mode, setMode] = useState("upcoming");
  const params = useSearchParams();
  return <>{music && <nav aria-label="課程紀錄分類" className="flex flex-wrap gap-2">{[["upcoming","即將上課"],["history","歷史／取消紀錄"]].map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} className={`min-h-11 rounded-lg border px-3 text-sm ${mode===value ? "bg-primary-50 text-primary-800" : "text-earth-600"}`} onClick={()=>setMode(value)}>{label}</button>)}</nav>}<CourseHistoryList key={music ? mode : "all"} mode={music ? mode : "all"} customerId={customerId} label={music ? "課表與出勤紀錄" : "課程預約與出席"} empty={music && mode==="upcoming" ? "尚無即將上課的預約。" : "尚無符合條件的紀錄。"} load={loadCourseCustomerBookings} render={b => <>
    <p className="font-medium">{formatTWDateTime(new Date(b.date))} · {b.name}</p>
    <p>{courseBookingHistoryLabel(b)} · {b.bookingKind === "OPENING_MAKEUP" ? "獨立補課權益" : b.unit === "TRIAL" ? "體驗不使用方案額度" : `${b.points} ${b.unit === "SESSION" ? "堂" : "點"}`}</p>
    <p>{b.plan}{b.expiresAt ? ` · 到期 ${toLocalDateStr(new Date(b.expiresAt))}` : ""}</p>
    <div className="flex flex-wrap gap-3"><DashboardLink className="inline-flex min-h-11 items-center text-primary-700 underline" href={music ? studentCourseHref(customerId, toLocalDateStr(new Date(b.date)), b.sessionId, params.toString()) : `/dashboard/courses?date=${toLocalDateStr(new Date(b.date))}&action=booking&session=${encodeURIComponent(b.sessionId)}`}>查看課堂／點名</DashboardLink>
      {music && (b.absenceKind === "STUDENT_LEAVE" || b.bookingKind === "OPENING_MAKEUP") && <DashboardLink className="inline-flex min-h-11 items-center text-primary-700 underline" href={studentMakeupsHref(customerId, params.toString())}>查看補課進度</DashboardLink>}
    </div>
    <details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">預約明細</summary><p>操作人：{b.operator} · 預約備註：{b.notes || "無"}</p></details>
  </>} /></>;
}
