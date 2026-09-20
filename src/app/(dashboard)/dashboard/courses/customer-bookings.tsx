"use client";
import { useEffect, useState, useTransition } from "react";
import { loadCourseCustomerBookings } from "@/server/actions/course-members";
import { formatTWDateTime } from "@/lib/date-utils";
type Rows = Extract<Awaited<ReturnType<typeof loadCourseCustomerBookings>>, { success: true }>['data'];
export function CourseCustomerBookings({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Rows | null>(null);
  const [hasMore,setHasMore]=useState(false);
  const [pending,start]=useTransition();
  const [error, setError] = useState("");
  useEffect(() => { let active = true; loadCourseCustomerBookings(customerId).then((r) => { if (active) { if (r.success) {setRows(r.data);setHasMore(r.hasMore);} else setError(r.error); } }).catch(() => active && setError("讀取失敗，請重新開啟")); return () => { active = false; }; }, [customerId]);
  function more(){if(pending)return;setError("");start(async()=>{try{const r=await loadCourseCustomerBookings(customerId,rows?.length??0);if(r.success){setRows(old=>[...(old??[]),...r.data]);setHasMore(r.hasMore);}else setError(r.error);}catch{setError("讀取失敗，請重試");}});}
  return <section className="mt-5 border-t border-earth-200 pt-4"><h3 className="font-semibold text-primary-800">課程預約與出席（每次 10 筆）</h3>{error ? <p role="status">{error}</p> : !rows ? <p>讀取中…</p> : !rows.length ? <p className="py-3 text-sm text-earth-500">尚無課程紀錄。</p> : <ul className="max-h-80 divide-y overflow-y-auto overscroll-contain">{rows.map((b) => <li key={b.id} className="space-y-1 py-3 text-sm"><p className="font-medium">{formatTWDateTime(new Date(b.date))} · {b.name}</p><p>{b.unit === "TRIAL" ? ({ATTENDED:"已出席",CANCELLED:"已取消",NO_SHOW:"未到",RESERVED:b.checkedIn?"已報到":"待出席"}[b.status]??b.status) : b.status === "ATTENDED" ? "已完成／已使用額度" : b.status === "CANCELLED" ? "已取消／已釋放" : b.status === "NO_SHOW" ? "未到／已釋放" : b.checkedIn ? "已報到／占用中" : "未報到／占用中"} · {b.unit === "TRIAL" ? "體驗不使用方案額度" : `${b.points} ${b.unit === "SESSION" ? "堂" : "點"}`}</p><p>{b.plan}{b.expiresAt ? ` · 到期 ${formatTWDateTime(new Date(b.expiresAt)).slice(0,10)}` : ""}</p><p>操作人：{b.operator} · 預約備註：{b.notes || "無"}</p></li>)}</ul>}{hasMore&&<button type="button" disabled={pending} className="min-h-11 rounded border px-3" onClick={more}>{pending?"讀取中…":"查看更多"}</button>}</section>;
}
