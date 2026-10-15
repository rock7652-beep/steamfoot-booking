"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { toLocalDateStr } from "@/lib/date-utils";
import { updateOpeningMakeup } from "@/server/actions/music-opening-makeup";
import type { OpeningMakeupWorkspace } from "@/server/queries/music-opening-makeup";
import type { OpeningMakeupCommand } from "@/server/services/music-opening-makeup";
const date = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const labels = { AVAILABLE: "待安排", RESERVED: "已保留", ATTENDED: "已核銷" };
export function OpeningMakeupList({ data, canCreate, canUpdate, compact = false }: { data: OpeningMakeupWorkspace; canCreate: boolean; canUpdate: boolean; compact?: boolean }) {
  const [search, setSearch] = useState("");
  const rows = data.rows.filter(row => row.customerName.includes(search.trim()));
  return <div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border p-3 text-sm" aria-label="補課摘要"><span>音教雲待補 <strong>{data.opening.outstanding}</strong> 堂</span><span>已安排 {data.opening.reserved} 堂</span>{!compact && <span>另有蒸管家請假 {data.native.outstanding} 堂</span>}</div><p className="text-sm text-stone-600">原系統帶入的補課獨立於一般餘堂，沿用原期限；完成實際出席後才核銷。</p><label className="flex flex-wrap items-center gap-2 text-sm">搜尋學員<input className="min-h-11 min-w-0 flex-1 rounded border px-3 text-base" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="space-y-2">{rows.map(row => <RightRow key={row.id} row={row} canCreate={canCreate} canUpdate={canUpdate} />)}{!rows.length && <p className="rounded border p-4 text-sm text-stone-600">{search ? "沒有符合條件的補課紀錄。" : "目前沒有已核對的音教雲補課紀錄。"}</p>}</div></div>;
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
  const expired = !!row.expiry && row.expiry < toLocalDateStr();
  return <section className="min-w-0 rounded-lg border p-3"><div className="flex min-w-0 flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="font-medium">{row.customerName} · {row.label}</p><p className="text-sm text-stone-600">{row.sourceDate} · {row.type === "TEACHER_ABSENT" ? "教師缺席" : "學員請假"} · {row.expiry ? `效期至 ${row.expiry}` : "已確認無期限"}</p></div><span className="rounded bg-stone-100 px-2 py-1 text-sm">{labels[row.state as keyof typeof labels] ?? "待核對"}{row.booking?.checkedIn ? "・已簽到" : ""}</span>{!mode && <div className="flex flex-wrap gap-2">{row.state === "AVAILABLE" && canCreate && !expired && <button className={button} onClick={() => open("RESERVE")}>安排補課</button>}{row.state === "RESERVED" && canUpdate && <><button className={button} onClick={() => open("ATTEND")}>確認出席</button><button className={button} onClick={() => open("CANCEL")}>取消保留</button><button className={button} onClick={() => open("TEACHER_ABSENT")}>老師缺席退回權益</button></>}{row.state === "ATTENDED" && canUpdate && <><button className={button} onClick={() => open("CORRECT_TO_RESERVED")}>更正為待點名</button><button className={button} onClick={() => open("CORRECT_TO_CANCELLED")}>更正並取消</button></>}</div>}</div>{expired && row.state === "AVAILABLE" && <p className="mt-2 text-sm text-amber-800">已超過補課期限</p>}{row.booking && <p className="mt-2 text-sm">{date(row.booking.date)} · {row.booking.sessionName}</p>}<DashboardLink className="inline-flex min-h-11 items-center text-sm text-primary-800 underline" href={`/dashboard/courses?view=customers&customerId=${encodeURIComponent(row.customerId)}&studentTab=makeups`}>查看學員</DashboardLink>{mode && <div className="mt-3 space-y-3 border-t pt-3">{mode === "RESERVE" && <label className="block">補課時段<select className="mt-1 min-h-11 w-full rounded border p-2" value={sessionId} onChange={e => setSessionId(e.target.value)}><option value="">選擇有效課堂</option>{row.sessions.map(session => <option key={session.id} value={session.id}>{date(session.date)} · {session.label}</option>)}</select>{row.sessions.length === 0 && <span className="text-sm">目前沒有符合原課程與效期的未來課堂</span>}</label>}{mode === "ATTEND" && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={actual} onChange={e => setActual(e.target.checked)} />已確認學員實際完成這堂補課（簽到不等於出席）</label>}{reasonRequired && <label className="block">{mode.startsWith("CORRECT") ? "更正原因" : "取消／缺席原因"}<input className="mt-1 min-h-11 w-full rounded border px-3" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>}{error && <p role="alert" className="text-red-700">{error}</p>}<div className="flex flex-wrap gap-2"><button className={button} disabled={pending || (mode === "RESERVE" && !sessionId) || (mode === "ATTEND" && !actual) || (!!reasonRequired && !reason.trim())} onClick={submit}>{pending ? "儲存中…" : "確認儲存"}</button><button className={button} disabled={pending} onClick={close}>取消</button></div></div>}</section>;
}
