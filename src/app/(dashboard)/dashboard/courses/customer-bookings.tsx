"use client";
import { CourseHistoryList } from "./history-list";
import { loadCourseCustomerBookings } from "@/server/actions/course-members";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { courseBookingHistoryLabel } from "@/lib/course-booking-history-label";
import { DashboardLink } from "@/components/dashboard-link";
export function CourseCustomerBookings({ customerId, music = false }: { customerId: string; music?: boolean }) {
  return <CourseHistoryList customerId={customerId} label={music ? "課表與出勤紀錄" : "課程預約與出席"} empty="尚無上課紀錄" load={loadCourseCustomerBookings} render={b => <>
    <p className="font-medium">{formatTWDateTime(new Date(b.date))} · {b.name}</p>
    <p>{courseBookingHistoryLabel(b)} · {b.bookingKind === "OPENING_MAKEUP" ? "獨立補課權益" : b.unit === "TRIAL" ? "體驗不使用方案額度" : `${b.points} ${b.unit === "SESSION" ? "堂" : "點"}`}</p>
    <p>{b.plan}{b.expiresAt ? ` · 到期 ${toLocalDateStr(new Date(b.expiresAt))}` : ""}</p>
    <div className="flex flex-wrap gap-3"><DashboardLink className="inline-flex min-h-11 items-center text-primary-700 underline" href={`/dashboard/courses?date=${toLocalDateStr(new Date(b.date))}&action=booking&session=${encodeURIComponent(b.sessionId)}`}>查看課堂／點名</DashboardLink>
      {music && (b.absenceKind === "STUDENT_LEAVE" || b.bookingKind === "OPENING_MAKEUP") && <DashboardLink className="inline-flex min-h-11 items-center text-primary-700 underline" href={`/dashboard/courses/makeups?customerId=${encodeURIComponent(customerId)}`}>查看補課進度</DashboardLink>}
    </div>
    <details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">預約明細</summary><p>操作人：{b.operator} · 預約備註：{b.notes || "無"}</p></details>
  </>} />;
}
