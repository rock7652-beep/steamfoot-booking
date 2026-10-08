"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOpeningMakeup } from "@/server/actions/music-opening-makeup";
import type { OpeningMakeupWorkspace } from "@/server/queries/music-opening-makeup";
import type { OpeningMakeupCommand } from "@/server/services/music-opening-makeup";
const date = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const labels = { AVAILABLE: "待安排", RESERVED: "已保留", ATTENDED: "已核銷" };
export function OpeningMakeupList({ data, canCreate, canUpdate }: { data: OpeningMakeupWorkspace; canCreate: boolean; canUpdate: boolean }) {
  const [search, setSearch] = useState("");
  return <div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border p-3 text-base" aria-label="補課摘要"><span>已核對學員待補 <strong>{data.totalOutstanding}</strong> 堂</span><span>期初 {data.opening.outstanding} 堂（保留 {data.opening.reserved}）</span><span>切點後請假 {data.native.outstanding} 堂（保留 {data.native.reserved}）</span></div><p className="text-sm text-stone-600">摘要涵蓋已完成來源核對的 {data.verifiedCustomerCount} 位學員。期初補課獨立於一般方案餘堂。切點後請假沿用原預約與方案；已完成歷史補課、曠課不新增權益。教師鐘點仍待核對。</p><label className="block">搜尋學員<input className="ml-2 min-h-11 rounded border px-3" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="space-y-2">{data.rows.filter(row => row.customerName.includes(search)).map(row => <RightRow key={row.id} row={row} canCreate={canCreate} canUpdate={canUpdate} />)}{data.rows.length === 0 && <p className="rounded border p-4">尚無已核對的期初補課權益。來源日期、映射、效期與餘堂是否重疊未確認時，維持阻擋。</p>}</div></div>;
}
function RightRow({ row, canCreate, canUpdate }: { row: OpeningMakeupWorkspace["rows"][number]; canCreate: boolean; canUpdate: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<OpeningMakeupCommand["action"] | null>(null);
  const [requestKey, setRequestKey] = useState("");
  function open(action: OpeningMakeupCommand["action"]) { setRequestKey(crypto.randomUUID()); setMode(action); }
  const [sessionId, setSessionId] = useState("");
  const [reason, setReason] = useState("");
  const [actual, setActual] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const reasonRequired = mode && ["CANCEL", "TEACHER_ABSENT", "CORRECT_TO_RESERVED", "CORRECT_TO_CANCELLED"].includes(mode);
  function close() { setMode(null); setReason(""); setActual(false); setSessionId(""); setError(""); }
  function submit() {
    if (!mode || pending) return;
    const input: OpeningMakeupCommand = { action: mode, entitlementId: row.id, expectedVersion: row.version, requestKey, sessionId: mode === "RESERVE" ? sessionId : null, bookingId: row.booking?.id ?? null, expectedStatus: (row.booking?.status as "RESERVED" | "ATTENDED" | undefined) ?? null, actualAttendance: actual, reason };
    startTransition(async () => { const result = await updateOpeningMakeup(input); if (!result.success) { setError(result.error); return; } close(); router.refresh(); });
  }
  const button = "min-h-11 rounded border px-3 py-2 text-sm disabled:opacity-50";
  return <section className="min-w-0 rounded-lg border p-3"><div className="flex min-w-0 flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="font-medium">{row.customerName} · {row.label}</p><p className="text-sm text-stone-600">{row.sourceDate} · {row.type === "TEACHER_ABSENT" ? "教師缺席" : "學員請假"} · {row.expiry ? `效期至 ${row.expiry}` : "已確認無期限"}</p></div><span className="rounded bg-stone-100 px-2 py-1 text-sm">{labels[row.state as keyof typeof labels] ?? "待核對"}{row.booking?.checkedIn ? "・已簽到" : ""}</span>{!mode && <div className="flex flex-wrap gap-2">{row.state === "AVAILABLE" && canCreate && <button className={button} onClick={() => open("RESERVE")}>安排補課</button>}{row.state === "RESERVED" && canUpdate && <><button className={button} onClick={() => open("ATTEND")}>確認出席</button><button className={button} onClick={() => open("CANCEL")}>取消保留</button><button className={button} onClick={() => open("TEACHER_ABSENT")}>老師缺席退回權益</button></>}{row.state === "ATTENDED" && canUpdate && <><button className={button} onClick={() => open("CORRECT_TO_RESERVED")}>更正為待點名</button><button className={button} onClick={() => open("CORRECT_TO_CANCELLED")}>更正並取消</button></>}</div>}</div>{row.booking && <p className="mt-2 text-sm">{date(row.booking.date)} · {row.booking.sessionName}</p>}{mode && <div className="mt-3 space-y-3 border-t pt-3">{mode === "RESERVE" && <label className="block">補課時段<select className="mt-1 min-h-11 w-full rounded border p-2" value={sessionId} onChange={e => setSessionId(e.target.value)}><option value="">選擇有效課堂</option>{row.sessions.map(session => <option key={session.id} value={session.id}>{date(session.date)} · {session.label}</option>)}</select>{row.sessions.length === 0 && <span className="text-sm">目前沒有符合原課程與效期的未來課堂</span>}</label>}{mode === "ATTEND" && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={actual} onChange={e => setActual(e.target.checked)} />已確認學員實際完成這堂補課（簽到不等於出席）</label>}{reasonRequired && <label className="block">{mode.startsWith("CORRECT") ? "更正原因" : "取消／缺席原因"}<input className="mt-1 min-h-11 w-full rounded border px-3" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>}{error && <p role="alert" className="text-red-700">{error}</p>}<div className="flex flex-wrap gap-2"><button className={button} disabled={pending || (mode === "RESERVE" && !sessionId) || (mode === "ATTEND" && !actual) || (!!reasonRequired && !reason.trim())} onClick={submit}>{pending ? "儲存中…" : "確認儲存"}</button><button className={button} disabled={pending} onClick={close}>取消</button></div></div>}</section>;
}
