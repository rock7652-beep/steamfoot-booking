"use client";
import { compensationRule, COMPENSATION_UNITS } from "@/lib/course-compensation";
import type { TeacherFeeDraft } from "./music-teacher-fee-editor";

export function SportsCoachFeeFields({ name, draft, defaultRules, disabled, onChange,allowInherit=true,compact=false }: {
  compact?:boolean;allowInherit?:boolean;name: string; draft?: TeacherFeeDraft; defaultRules?: unknown; disabled?: boolean; onChange: (draft: TeacherFeeDraft) => void;
}) {
  const mode = draft?.mode ?? "INHERIT";
  const shared = compensationRule.safeParse(Array.isArray(defaultRules) && defaultRules.length === 1 ? defaultRules[0] : null);
  const summary = shared.success ? `${shared.data.mode === "SHARE" ? "拆帳" : shared.data.mode === "HOUR" ? "鐘點" : "每堂固定"} ${shared.data.value}${shared.data.mode === "SHARE" ? "%" : shared.data.mode === "HOUR" ? " 元／小時" : " 元／堂"}` : "教學項目預設待設定";
  const field = "min-h-11 min-w-0 w-full rounded-xl border border-earth-200 bg-white px-3 text-base disabled:opacity-60";
  return <div className={compact?"grid min-w-52 flex-[2] grid-cols-2 items-center gap-2 py-1":"min-w-0 space-y-1 py-2"}>
    <select aria-label={`${name}計酬方式`} className={field} value={mode} disabled={disabled} onChange={e => onChange({ mode: e.target.value as TeacherFeeDraft["mode"], value: "", revision: draft?.revision ?? 0 })}>
      <option value="INHERIT" disabled={!allowInherit}>{allowInherit?compact?"沿用服務預設":"沿用教學項目預設":compact?"請選拆帳方式":"請選擇計酬方式"}</option><option value="SHARE">{compact?"比例拆帳":"個別拆帳"}</option><option value="HOUR">{compact?"每小時":"個別鐘點"}</option><option value="CLASS">{compact?"每次固定":"每堂固定費"}</option>
    </select>
    {mode === "INHERIT" ? <p className="text-sm text-earth-600">{allowInherit?(compact?summary.replaceAll("教學項目","服務").replaceAll("堂","次"):summary):"尚未設定個別計酬"}</p> : <label className="flex items-center gap-2"><input aria-label={`${name}計酬數值`} type="number" inputMode="decimal" className={field} min="0" max={mode === "SHARE" ? 100 : 1000000} step="0.01" value={draft?.value ?? ""} disabled={disabled} onChange={e => onChange({ mode, value: e.target.value, revision: draft?.revision ?? 0 })} /><span className="shrink-0 text-sm">{mode === "SHARE" ? "%" : compact?COMPENSATION_UNITS[mode].replaceAll("堂","次"):COMPENSATION_UNITS[mode]}</span></label>}
  </div>;
}
