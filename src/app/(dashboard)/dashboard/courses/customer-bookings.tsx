"use client";
import { CourseHistoryList } from "./history-list";
import { loadCourseCustomerBookings } from "@/server/actions/course-members";
import { formatTWDateTime } from "@/lib/date-utils";
export function CourseCustomerBookings({ customerId }: { customerId: string }) {
  return <CourseHistoryList customerId={customerId} label="課程預約與出席" empty="此範圍尚無課程紀錄。" load={loadCourseCustomerBookings} render={b=><><p className="font-medium">{formatTWDateTime(new Date(b.date))} · {b.name}</p><p>{b.unit === "TRIAL" ? ({ATTENDED:"已出席",CANCELLED:"已取消",NO_SHOW:"未到",RESERVED:b.checkedIn?"已報到":"待出席"}[b.status]??b.status) : b.status === "ATTENDED" ? "已完成／已使用額度" : b.status === "CANCELLED" ? "已取消／已釋放" : b.status === "NO_SHOW" ? "未到／已釋放" : b.checkedIn ? "已報到／占用中" : "未報到／占用中"} · {b.unit === "TRIAL" ? "體驗不使用方案額度" : `${b.points} ${b.unit === "SESSION" ? "堂" : "點"}`}</p><p>{b.plan}{b.expiresAt ? ` · 到期 ${formatTWDateTime(new Date(b.expiresAt)).slice(0,10)}` : ""}</p><details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">預約明細</summary><p>操作人：{b.operator} · 預約備註：{b.notes || "無"}</p></details></>}/>;
}
