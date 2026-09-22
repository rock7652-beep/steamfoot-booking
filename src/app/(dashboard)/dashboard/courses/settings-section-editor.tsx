"use client";
import { courseField } from "@/components/admin/course-ui";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCourseSettingsSection } from "@/server/actions/course-settings";
import type { CourseSettingsSectionInput } from "@/lib/course-settings-sections";

type Field = { key: string; label: string; type?: "text" | "url" | "number"; max?: number };
const fields: Record<CourseSettingsSectionInput["section"], Field[]> = {
  store: [{ key: "name", label: "店家名稱", max: 100 }, { key: "address", label: "店家地址", max: 300 }, { key: "mapUrl", label: "地圖網址", type: "url" }, { key: "lineOfficialUrl", label: "LINE 官方帳號網址", type: "url" }],
  booking: [{ key: "bookingLeadMinutes", label: "上課前幾分鐘截止預約", type: "number" }, { key: "cancellationLeadMinutes", label: "上課前幾分鐘截止自行取消", type: "number" }],
  payment: [{ key: "bankName", label: "銀行名稱", max: 100 }, { key: "bankCode", label: "銀行代號", max: 20 }, { key: "bankAccountNumber", label: "銀行帳號", max: 50 }],
};
type Props = { initial: CourseSettingsSectionInput; onStatus: (section: CourseSettingsSectionInput["section"], dirty: boolean, pending: boolean) => void };
export function CourseSettingsSectionEditor({ initial, onStatus }: Props) {
  const section = initial.section;
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).filter(([key]) => key !== "section").map(([key, value]) => [key, String(value)])));
  const [saved, setSaved] = useState(draft);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const saving = useRef(false);
  const router = useRouter();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { onStatus(section, dirty, pending); }, [section, dirty, pending, onStatus]);
  const label = section === "store" ? "店家資料" : section === "booking" ? "預約截止規則" : "銀行資訊";
  return <form aria-label={`編輯${label}`} className="mt-4 border-t border-earth-200 pt-4" onSubmit={event => {
    event.preventDefault();
    if (saving.current || !dirty) return;
    saving.current = true;
    setMessage("");
    const submitted = { ...draft };
    const input = section === "booking" ? { section, bookingLeadMinutes: Number(draft.bookingLeadMinutes), cancellationLeadMinutes: Number(draft.cancellationLeadMinutes) } : { ...draft, section };
    start(async () => {
      try {
        const result = await saveCourseSettingsSection(input);
        if (!result.success) { setMessage(result.error || "儲存失敗，輸入內容已保留"); return; }
        setSaved(submitted); setConfirmDiscard(false); setMessage("已儲存"); router.refresh();
      } catch { setMessage("連線失敗，輸入內容已保留，請重試"); }
      finally { saving.current = false; }
    });
  }}>
    <fieldset disabled={pending} className={section === "payment" ? "grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_100px_minmax(0,1.4fr)]" : "grid min-w-0 gap-4 sm:grid-cols-2"}>
      {fields[section].map(field => <label key={field.key} className={`min-w-0 text-sm ${field.type === "url" ? "sm:col-span-2" : ""}`}>
        {field.label}<input name={field.key} type={field.type ?? "text"} value={draft[field.key]} required={field.key === "name" || field.type === "number"} min={field.type === "number" ? 0 : undefined} max={field.type === "number" ? 43200 : undefined} maxLength={field.max} step={field.type === "number" ? 1 : undefined} onChange={event => { setDraft(previous => ({ ...previous, [field.key]: event.target.value })); setMessage(""); }} className={`${courseField} mt-1`} />
      </label>)}
    </fieldset>
    {section === "booking" && <p className="mt-3 text-sm text-earth-600">0 表示上課開始前可操作。此處只調整截止時間，不變更扣堂規則。</p>}
    {message && <p role="status" className="mt-3 text-sm text-amber-800">{message}</p>}
    {confirmDiscard && <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm"><p>尚有未儲存內容，要捨棄本區修改嗎？</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setConfirmDiscard(false)} className="min-h-11 rounded border px-3">繼續編輯</button><button type="button" onClick={() => { setDraft(saved); setConfirmDiscard(false); setMessage(""); }} className="min-h-11 rounded border px-3">捨棄本區修改</button></div></div>}
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-earth-200 bg-white py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <span className="mr-auto text-xs text-earth-500">{pending ? "儲存中…" : dirty ? "尚未儲存 · 切換分類會保留內容" : "尚未變更"}</span>
      <button type="button" disabled={pending || !dirty} onClick={() => setConfirmDiscard(true)} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg border px-4 disabled:opacity-50">取消</button>
      <button type="submit" disabled={pending || !dirty} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50">{pending ? "儲存中…" : `儲存${label}`}</button>
    </div>
  </form>;
}
