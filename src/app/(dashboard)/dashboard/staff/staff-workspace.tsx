"use client";

import { useMemo, useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SubmitButton } from "@/components/submit-button";
import { StaffStatusToggle } from "./staff-status-toggle";
import { ResetPasswordButton } from "./reset-password-button";

export type StaffWorkspacePerson = {
  id: string;
  userId: string;
  displayName: string;
  legalName: string;
  roleLabel: string;
  email: string;
  phone: string | null;
  colorCode: string;
  status: string;
  customerCount: number;
  specialties: string;
  emergencyContact: { name: string; relation: string; phone: string } | null;
  weeklyAvailability: readonly { dayOfWeek: number; startTime: string; endTime: string }[];
  scheduleExceptions: readonly { date: string; label: string; tone: "leave" | "extra" }[];
  canEdit: boolean;
  canResetPassword: boolean;
};

type WorkspaceTab = "overview" | "schedule" | "exceptions";

const TAB_LABELS: Record<WorkspaceTab, string> = {
  overview: "人員總覽",
  schedule: "接客時段",
  exceptions: "休假與例外",
};
const WEEK_DAYS = [
  { dayOfWeek: 1, label: "週一" },
  { dayOfWeek: 2, label: "週二" },
  { dayOfWeek: 3, label: "週三" },
  { dayOfWeek: 4, label: "週四" },
  { dayOfWeek: 5, label: "週五" },
  { dayOfWeek: 6, label: "週六" },
  { dayOfWeek: 0, label: "週日" },
] as const;
const inputClass = "mt-1 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200";

export function StaffWorkspace({ people, today, canManage, createAction }: {
  people: readonly StaffWorkspacePerson[];
  today: string;
  canManage: boolean;
  createAction: (formData: FormData) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = useMemo(() => people.find((person) => person.id === selectedId) ?? null, [people, selectedId]);
  const servicePeople = people.filter((person) => person.weeklyAvailability.length > 0);
  const activeCount = people.filter((person) => person.status === "ACTIVE").length;
  const exceptionCount = people.reduce((count, person) => count + person.scheduleExceptions.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-earth-200">
        <nav className="flex gap-1" aria-label="人員管理功能">
          {(Object.keys(TAB_LABELS) as WorkspaceTab[]).map((key) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`border-b-2 px-4 py-3 text-sm font-medium transition ${tab === key ? "border-primary-600 text-primary-700" : "border-transparent text-earth-500 hover:text-earth-800"}`}>
              {TAB_LABELS[key]}
              {key === "exceptions" && exceptionCount > 0 ? <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">{exceptionCount}</span> : null}
            </button>
          ))}
        </nav>
        {canManage ? <button type="button" onClick={() => setCreating(true)} className="mb-2 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700">＋ 新增人員</button> : null}
      </div>

      {tab === "overview" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="人員摘要">
            <SummaryCard label="人員總數" value={`${people.length} 位`} hint={`${activeCount} 位啟用中`} />
            <SummaryCard label="可接客人員" value={`${servicePeople.length} 位`} hint="依個人接客時段開放" />
            <SummaryCard label="近期排班例外" value={`${exceptionCount} 筆`} hint="休假、加班與臨時異動" />
          </section>
          <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {people.map((person) => (
              <button key={person.id} type="button" onClick={() => setSelectedId(person.id)} className="group rounded-xl border border-earth-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: person.colorCode }}>{initials(person.displayName)}</span>
                    <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-earth-900">{person.displayName}</h2><p className="mt-0.5 text-xs text-earth-500">{person.roleLabel}</p></div>
                  </div>
                  <StatusBadge status={person.status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-earth-100 pt-3 text-xs">
                  <div><p className="text-earth-400">專業項目</p><p className="mt-1 line-clamp-2 font-medium text-earth-700">{person.specialties}</p></div>
                  <div><p className="text-earth-400">固定接客</p><p className="mt-1 font-medium text-earth-700">{person.weeklyAvailability.length > 0 ? `每週 ${person.weeklyAvailability.length} 天` : "不直接接客"}</p></div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-earth-500"><span>服務顧客 {person.customerCount} 位</span><span className="font-medium text-primary-700 group-hover:underline">查看詳情 →</span></div>
              </button>
            ))}
          </section>
        </>
      ) : null}
      {tab === "schedule" ? <ScheduleGrid people={servicePeople} today={today} /> : null}
      {tab === "exceptions" ? <ExceptionPanel people={servicePeople} today={today} /> : null}
      {selected ? <PersonDrawer person={selected} onClose={() => setSelectedId(null)} /> : null}
      {creating ? <CreatePersonDrawer createAction={createAction} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-xl border border-earth-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs text-earth-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-earth-900">{value}</p><p className="mt-0.5 text-[11px] text-earth-400">{hint}</p></div>;
}

function ScheduleGrid({ people, today }: { people: readonly StaffWorkspacePerson[]; today: string }) {
  const monday = getMonday(today);
  return (
    <section className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div><h2 className="text-sm font-semibold text-earth-900">每週固定接客時段</h2><p className="mt-0.5 text-xs text-earth-500">以人員為主；點選日期可調整當天實際時段</p></div>
        <Link href={`/dashboard/duty?week=${monday}`} className="rounded-lg border border-earth-300 px-3 py-2 text-xs font-medium text-earth-700 hover:bg-earth-50">編輯本週實際排班</Link>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-earth-50 text-xs text-earth-500"><tr><th className="sticky left-0 z-10 w-44 border-r border-earth-200 bg-earth-50 px-4 py-3 text-left">人員</th>{WEEK_DAYS.map((day, index) => <th key={day.dayOfWeek} className="border-r border-earth-200 px-2 py-3 text-center last:border-r-0"><div>{day.label}</div><div className="mt-0.5 text-[10px] font-normal text-earth-400">{formatShortDate(addDays(monday, index))}</div></th>)}</tr></thead>
          <tbody className="divide-y divide-earth-100">
            {people.map((person) => (
              <tr key={person.id}>
                <td className="sticky left-0 z-10 border-r border-earth-200 bg-white px-4 py-3"><div className="font-semibold text-earth-900">{person.displayName}</div><div className="mt-0.5 text-[11px] text-earth-400">{person.specialties}</div></td>
                {WEEK_DAYS.map((day, index) => {
                  const date = addDays(monday, index);
                  const availability = person.weeklyAvailability.find((item) => item.dayOfWeek === day.dayOfWeek);
                  const exception = person.scheduleExceptions.find((item) => item.date === date);
                  const tone = exception?.tone === "leave" ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : exception?.tone === "extra" ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : availability ? "bg-primary-50 font-medium text-primary-800 hover:bg-primary-100" : "bg-earth-50 text-earth-400 hover:bg-earth-100";
                  return <td key={day.dayOfWeek} className="border-r border-earth-100 p-2 text-center last:border-r-0"><Link href={`/dashboard/duty/${date}?staff=${encodeURIComponent(person.id)}`} className={`block rounded-lg px-2 py-3 text-xs transition ${tone}`}>{exception?.label ?? (availability ? `${availability.startTime}–${availability.endTime}` : "休假")}</Link></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap gap-4 border-t border-earth-100 px-4 py-3 text-[11px] text-earth-500"><Legend className="bg-primary-100" label="固定接客" /><Legend className="bg-earth-100" label="固定休假" /><Legend className="bg-rose-100" label="臨時休假" /><Legend className="bg-blue-100" label="臨時加班" /></footer>
    </section>
  );
}

function ExceptionPanel({ people, today }: { people: readonly StaffWorkspacePerson[]; today: string }) {
  const exceptions = people.flatMap((person) => person.scheduleExceptions.map((exception) => ({ ...exception, person }))).filter((item) => item.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="rounded-xl border border-earth-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-earth-200 px-4 py-3"><div><h2 className="text-sm font-semibold text-earth-900">休假與臨時異動</h2><p className="mt-0.5 text-xs text-earth-500">集中查看個人休假、加班及與固定週表不同的日期</p></div><Link href="/dashboard/duty" className="rounded-lg border border-earth-300 px-3 py-2 text-xs font-medium text-earth-700 hover:bg-earth-50">＋ 新增例外日期</Link></header>
      {exceptions.length === 0 ? <div className="px-4 py-14 text-center text-sm text-earth-400">目前沒有近期排班例外</div> : <div className="divide-y divide-earth-100">{exceptions.map((item) => <div key={`${item.person.id}-${item.date}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${item.tone === "leave" ? "bg-rose-400" : "bg-blue-400"}`} /><div><p className="text-sm font-semibold text-earth-900">{item.person.displayName}</p><p className="mt-0.5 text-xs text-earth-500">{item.label}</p></div></div><div className="flex items-center gap-3"><span className="text-sm font-medium tabular-nums text-earth-700">{item.date}</span><Link href={`/dashboard/duty/${item.date}`} className="text-xs font-medium text-primary-700 hover:underline">調整</Link></div></div>)}</div>}
    </section>
  );
}

function PersonDrawer({ person, onClose }: { person: StaffWorkspacePerson; onClose: () => void }) {
  return (
    <Drawer title="人員資料" onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-earth-100 pb-4"><span className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: person.colorCode }}>{initials(person.displayName)}</span><div><h2 className="font-semibold text-earth-900">{person.displayName}</h2><p className="text-xs text-earth-500">{person.roleLabel}・{person.legalName}</p></div></div>
      <InfoSection title="基本資料"><Info label="手機" value={person.phone || "尚未設定"} /><Info label="Email" value={person.email} /><Info label="狀態" value={person.status === "ACTIVE" ? "啟用中" : "已停用"} /></InfoSection>
      <InfoSection title="專業與接客"><Info label="專業項目" value={person.specialties} /><Info label="每週接客" value={person.weeklyAvailability.length > 0 ? `${person.weeklyAvailability.length} 天` : "不直接接客"} /></InfoSection>
      <InfoSection title="緊急聯絡人"><Info label="聯絡方式" value={person.emergencyContact ? `${person.emergencyContact.name}（${person.emergencyContact.relation}） ${person.emergencyContact.phone}` : "尚未設定"} /></InfoSection>
      <div className="mt-6 flex flex-wrap gap-2 border-t border-earth-100 pt-4">{person.canEdit ? <Link href={`/dashboard/staff/${person.id}/edit`} className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white hover:bg-primary-700">編輯完整資料</Link> : null}{person.weeklyAvailability.length > 0 ? <Link href="/dashboard/duty" className="rounded-lg border border-earth-300 px-4 py-2 text-xs font-medium text-earth-700 hover:bg-earth-50">設定接客時段</Link> : null}{person.canEdit ? <StaffStatusToggle staffId={person.id} currentStatus={person.status} /> : null}{person.canResetPassword ? <ResetPasswordButton userId={person.userId} displayName={person.displayName} /> : null}</div>
    </Drawer>
  );
}

function CreatePersonDrawer({ createAction, onClose }: { createAction: (formData: FormData) => void | Promise<void>; onClose: () => void }) {
  return <Drawer title="新增人員" onClose={onClose}><form action={createAction} className="space-y-4"><Field label="人員類型"><select name="role" defaultValue="PARTNER" className={inputClass}><option value="PARTNER">服務人員（芳療師／老師／教練）</option><option value="OWNER">店長</option></select></Field><Field label="真實姓名"><input name="name" required className={inputClass} /></Field><Field label="顯示名稱"><input name="displayName" required className={inputClass} placeholder="例如：08號 陳語安" /></Field><Field label="Email"><input name="email" type="email" required className={inputClass} /></Field><Field label="手機"><input name="phone" type="tel" className={inputClass} /></Field><Field label="初始密碼"><input name="password" type="password" minLength={6} required className={inputClass} /></Field><div className="grid grid-cols-2 gap-3"><Field label="識別色"><input name="colorCode" type="color" defaultValue="#8fa89b" className="mt-1 h-10 w-full rounded-lg border border-earth-300" /></Field><Field label="月度空間費"><input name="monthlySpaceFee" type="number" min="0" defaultValue="0" className={inputClass} /></Field></div><div className="flex justify-end gap-2 border-t border-earth-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg border border-earth-300 px-4 py-2 text-sm text-earth-700 hover:bg-earth-50">取消</button><SubmitButton label="建立人員" pendingLabel="建立中..." className="bg-primary-600 text-white hover:bg-primary-700" /></div></form></Drawer>;
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex justify-end"><button type="button" aria-label="關閉側邊面板" onClick={onClose} className="absolute inset-0 bg-earth-950/25" /><aside role="dialog" aria-modal="true" aria-label={title} className="relative h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl"><header className="mb-5 flex items-center justify-between"><h1 className="text-lg font-semibold text-earth-900">{title}</h1><button type="button" onClick={onClose} className="rounded-lg p-2 text-earth-500 hover:bg-earth-100" aria-label="關閉">✕</button></header>{children}</aside></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium text-earth-700">{label}{children}</label>; }
function InfoSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-5"><h3 className="text-xs font-semibold uppercase tracking-wide text-earth-400">{title}</h3><dl className="mt-2 space-y-3">{children}</dl></section>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-earth-400">{label}</dt><dd className="mt-0.5 text-sm text-earth-700">{value}</dd></div>; }
function StatusBadge({ status }: { status: string }) { return <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-earth-100 text-earth-500"}`}>{status === "ACTIVE" ? "啟用" : "停用"}</span>; }
function Legend({ className, label }: { className: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded ${className}`} />{label}</span>; }
function initials(name: string): string { const badge = name.match(/^(\d+)號/); return badge ? badge[1] : name.replace(/\s+/g, "").slice(0, 2); }
function getMonday(dateStr: string): string { const date = new Date(`${dateStr}T00:00:00Z`); const day = date.getUTCDay(); date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day)); return date.toISOString().slice(0, 10); }
function addDays(dateStr: string, days: number): string { const date = new Date(`${dateStr}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function formatShortDate(dateStr: string): string { const [, month, day] = dateStr.split("-"); return `${Number(month)}/${Number(day)}`; }
