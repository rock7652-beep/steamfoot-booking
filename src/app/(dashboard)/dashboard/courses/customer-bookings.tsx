"use client";
import { useEffect, useState } from "react";
import { loadCourseCustomerBookings } from "@/server/actions/course-members";
import { formatTWDateTime } from "@/lib/date-utils";
type Rows = Extract<Awaited<ReturnType<typeof loadCourseCustomerBookings>>, { success: true }>['data'];
export function CourseCustomerBookings({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Rows | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; loadCourseCustomerBookings(customerId).then((r) => { if (active) { if (r.success) setRows(r.data); else setError(r.error); } }).catch(() => active && setError("讀取失敗，請重新開啟")); return () => { active = false; }; }, [customerId]);
  return <section className="mt-5 border-t border-earth-200 pt-4"><h3 className="font-semibold text-primary-800">課程預約與出席（最近 100 筆）</h3>{error ? <p role="status">{error}</p> : !rows ? <p>讀取中…</p> : !rows.length ? <p className="py-3 text-sm text-earth-500">尚無課程紀錄。</p> : <ul className="max-h-80 divide-y overflow-y-auto overscroll-contain">{rows.map((b) => <li key={b.id} className="space-y-1 py-3 text-sm"><p className="font-medium">{formatTWDateTime(new Date(b.date))} · {b.name}</p><p>{b.status === "ATTENDED" ? "已完成／已使用額度" : b.status === "CANCELLED" ? "已取消／已釋放" : b.status === "NO_SHOW" ? "未到／已釋放" : b.checkedIn ? "已報到／占用中" : "未報到／占用中"} · {b.points} {b.unit === "SESSION" ? "堂" : "點"}</p><p>{b.plan} · 到期 {formatTWDateTime(new Date(b.expiresAt)).slice(0,10)}</p><p>操作人：{b.operator} · 預約備註：{b.notes || "無"}</p></li>)}</ul>}</section>;
}
