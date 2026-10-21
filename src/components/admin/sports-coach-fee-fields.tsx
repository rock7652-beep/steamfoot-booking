"use client";
import { compensationRule, COMPENSATION_UNITS } from "@/lib/course-compensation";
import type { TeacherFeeDraft } from "./music-teacher-fee-editor";

export function SportsCoachFeeFields({ name, draft, defaultRules, disabled, onChange }: {
  name: string; draft?: TeacherFeeDraft; defaultRules?: unknown; disabled?: boolean; onChange: (draft: TeacherFeeDraft) => void;
}) {
  const mode = draft?.mode ?? "INHERIT";
  const shared = compensationRule.safeParse(Array.isArray(defaultRules) && defaultRules.length === 1 ? defaultRules[0] : null);
  const summary = shared.success ? `${shared.data.mode === "SHARE" ? "拆帳" : shared.data.mode === "HOUR" ? "鐘點" : "每堂固定"} ${shared.data.value}${shared.data.mode === "SHARE" ? "%" : shared.data.mode === "HOUR" ? " 元／小時" : " 元／堂"}` : "教學項目預設待設定";
  const field = "min-h-11 min-w-0 w-full rounded-xl border border-earth-200 bg-white px-3 text-base disabled:opacity-60";
  return <div className="min-w-0 space-y-1 py-2">
    <select aria-label={`${name}計酬方式`} className={field} value={mode} disabled={disabled} onChange={e => onChange({ mode: e.target.value as TeacherFeeDraft["mode"], value: "", revision: draft?.revision ?? 0 })}>
      <option value="INHERIT">沿用教學項目預設</option><option value="SHARE">個別拆帳</option><option value="HOUR">個別鐘點</option><option value="CLASS">每堂固定費</option>
    </select>
    {mode === "INHERIT" ? <p className="text-sm text-earth-600">{summary}</p> : <label className="flex items-center gap-2"><input aria-label={`${name}計酬數值`} type="number" inputMode="decimal" className={field} min="0" max={mode === "SHARE" ? 100 : 1000000} step="0.01" value={draft?.value ?? ""} disabled={disabled} onChange={e => onChange({ mode, value: e.target.value, revision: draft?.revision ?? 0 })} /><span className="shrink-0 text-sm">{mode === "SHARE" ? "%" : COMPENSATION_UNITS[mode]}</span></label>}
  </div>;
}
