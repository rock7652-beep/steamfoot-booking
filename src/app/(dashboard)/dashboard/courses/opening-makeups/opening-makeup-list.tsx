"use client";
import { publishMusicFinanceChange } from "@/lib/music-finance-sync";
import { useState, useTransition } from "react";
import { studentReturnHref } from "@/lib/music-student-navigation";
import { useRouter } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { toLocalDateStr } from "@/lib/date-utils";
import { updateOpeningMakeup } from "@/server/actions/music-opening-makeup";
import type { OpeningMakeupWorkspace } from "@/server/queries/music-opening-makeup";
import type { OpeningMakeupCommand } from "@/server/services/music-opening-makeup";
const date = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
import { CourseTestDataFilter, isCourseTestData } from "@/components/admin/course-test-data-filter";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { RosterToolbar, RosterTable } from "@/components/admin/roster-primitives";
import { makeupStatus } from "@/lib/music-display";
export function OpeningMakeupList({ data, canCreate, canUpdate, compact = false, classified=false, legacy=false }: { data: OpeningMakeupWorkspace; canCreate: boolean; canUpdate: boolean; compact?: boolean; classified?:boolean;legacy?:boolean }) {
  const [search, setSearch] = useState("");
  const [hideTests, setHideTests] = useState(true);
  const [status, setStatus] = useState("all");
  const sourceLabel = legacy ? "舊驗收補課" : "音教雲補課";
  const today = toLocalDateStr();
  const visible = data.rows.filter(row => classified || !hideTests || !isCourseTestData(row.customerName));
  const rows = visible.filter(row => row.customerName.includes(search.trim()) && (status === "all" || makeupStatus(row.state, row.expiry, today).label === status));
  const outstanding = visible.filter(row => row.state !== "ATTENDED").length;
  const reserved = visible.filter(row => row.state === "RESERVED").length;
  const rowIds = new Set(rows.map(row=>row.id));
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="補課摘要"><span>{legacy?"舊驗收待補":"音教雲待補"} <strong>{outstanding}</strong> 堂</span><span>已安排 {reserved} 堂</span>{!compact && <span>另有蒸管家請假 {data.native.outstanding} 堂（含測試資料）</span>}</div>
    <details className="text-sm text-earth-600"><summary className="inline-flex min-h-11 cursor-pointer items-center">補課規則</summary><p>補課不併入一般餘堂，沿用原期限；實際完成上課後才扣除。</p></details>
    <RosterToolbar label={`${sourceLabel}篩選`}><label className="flex min-w-0 flex-1 items-center gap-2 text-sm">搜尋學員<input className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-200 px-3 text-base" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label={`${sourceLabel}狀態`} className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm" value={status} onChange={e=>setStatus(e.target.value)}>{["all","待安排","已安排","已完成","已逾期"].map(value=><option key={value} value={value}>{value === "all" ? "全部狀態" : value}</option>)}</select>{!classified&&<CourseTestDataFilter names={data.rows.map(row=>row.customerName)} checked={hideTests} onChange={setHideTests}/>}</RosterToolbar>
    <p className="text-sm text-earth-600">顯示 {rows.length} 筆{hideTests && data.rows.length > visible.length ? ` · 已隱藏 ${data.rows.length-visible.length} 筆驗收／測試資料` : ""}</p>
    <div className="[&_table]:min-w-[1000px]"><RosterTable label={`${sourceLabel}清單`} dense widths={["11%","18%","16%","12%","16%","19%","8%"]} columns={["學員", "課程", "原課日期", "補課期限", "補課日期", "狀態", "操作"]}>{data.rows.map(row => <RightRow legacy={legacy} key={row.id} hidden={!rowIds.has(row.id)} row={row} canCreate={canCreate} canUpdate={canUpdate} />)}{!rows.length && <tr><td colSpan={7}>沒有符合條件的紀錄</td></tr>}</RosterTable></div>
  </div>;
}
function RightRow({ row, canCreate, canUpdate, hidden, legacy }: { legacy: boolean; hidden: boolean; row: OpeningMakeupWorkspace["rows"][number]; canCreate: boolean; canUpdate: boolean }) {
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
    startTransition(async () => { const result = await updateOpeningMakeup(input); if (!result.success) { setError(result.error); return; } close(); publishMusicFinanceChange(); router.refresh(); });
  }
  const button = "min-h-11 rounded border px-3 py-2 text-sm disabled:opacity-50";
  const status = makeupStatus(row.state, row.expiry, toLocalDateStr());
  const expired = !!row.expiry && row.expiry < toLocalDateStr();
  return <><tr hidden={hidden}><td><DashboardLink className="inline-flex min-h-11 items-center font-semibold text-primary-800 underline" href={studentReturnHref(row.customerId, legacy ? "dataScope=legacy" : "")}>{row.customerName}</DashboardLink></td><td>{row.label}</td><td>{row.sourceDate}<p className="text-earth-600">{row.type === "TEACHER_ABSENT" ? "教師缺席" : "學員請假"}</p></td><td>{row.expiry || "已確認無期限"}</td><td>{row.booking ? <>{date(row.booking.date)}<p>{row.booking.sessionName}</p></> : "尚未安排"}</td><td><span className={`inline-block rounded px-2 py-1 ${status.tone}`}>{status.label}{row.booking?.checkedIn ? "・已簽到" : ""}</span></td><td>{!mode && ((row.state === "AVAILABLE" && canCreate && !expired) || (row.state !== "AVAILABLE" && canUpdate)) ? <ExclusiveMenu label={`${row.customerName} 補課更多操作`} triggerText="⋯"><div className="grid gap-1 [&_button]:border-0 [&_button]:text-left">{row.state === "AVAILABLE" && canCreate && !expired && <button className={button} onClick={() => open("RESERVE")}>安排補課</button>}{row.state === "RESERVED" && canUpdate && <><button className={button} onClick={() => open("ATTEND")}>確認出席</button><button className={button} onClick={() => open("CANCEL")}>取消保留</button><button className={button} onClick={() => open("TEACHER_ABSENT")}>老師缺席退回權益</button></>}{row.state === "ATTENDED" && canUpdate && <><button className={button} onClick={() => open("CORRECT_TO_RESERVED")}>更正為待點名</button><button className={button} onClick={() => open("CORRECT_TO_CANCELLED")}>更正並取消</button></>}</div></ExclusiveMenu> : "—"}</td></tr>{mode && <tr hidden={hidden}><td colSpan={7}>{mode && <div className="mt-3 space-y-3 border-t pt-3">{mode === "RESERVE" && <label className="block">補課時段<select aria-label="補課時段" className="mt-1 min-h-11 w-full rounded border p-2" value={sessionId} onChange={e => setSessionId(e.target.value)}><option value="">選擇有效課堂</option>{row.sessions.map(session => <option key={session.id} value={session.id}>{date(session.date)} · {session.label}</option>)}</select>{row.sessions.length === 0 && <span className="text-sm">目前沒有符合原課程與效期的未來課堂</span>}</label>}{mode === "ATTEND" && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={actual} onChange={e => setActual(e.target.checked)} />已確認學員實際完成這堂補課（簽到不等於出席）</label>}{reasonRequired && <label className="block">{mode.startsWith("CORRECT") ? "更正原因" : "取消／缺席原因"}<input className="mt-1 min-h-11 w-full rounded border px-3" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>}{error && <p role="alert" className="text-red-700">{error}</p>}<div className="flex flex-wrap gap-2"><button className={button} disabled={pending || (mode === "RESERVE" && !sessionId) || (mode === "ATTEND" && !actual) || (!!reasonRequired && !reason.trim())} onClick={submit}>{pending ? "儲存中…" : "確認儲存"}</button><button className={button} disabled={pending} onClick={close}>取消</button></div></div>}</td></tr>}</>;
}
