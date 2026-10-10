"use client";
import styles from "@/components/settings/settings-form-layout.module.css";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSettingsSave } from "@/components/admin/use-settings-save";
import { courseSettingsSectionRevision,savedCourseSettingsSection,type CourseSettingsSectionInput } from "@/lib/course-settings-sections";

type Field = { key: string; label: string; type?: "text" | "url" | "number"; max?: number };
const fields: Record<CourseSettingsSectionInput["section"], Field[]> = {
  store: [{ key: "name", label: "店家名稱", max: 100 }, { key: "address", label: "店家地址", max: 300 }, { key: "shopPhone", label: "店家電話", max: 50 }, { key: "mapUrl", label: "地圖網址", type: "url" }, { key: "lineOfficialId", label: "官方 LINE ID", max: 100 }, { key: "lineOfficialUrl", label: "LINE 官方帳號網址", type: "url" }],
  booking: [{ key: "bookingLeadMinutes", label: "預約截止時間", type: "number" }, { key: "cancellationLeadMinutes", label: "自行取消截止時間", type: "number" }],
  payment: [{ key: "bankName", label: "銀行名稱", max: 100 }, { key: "bankCode", label: "銀行代號", max: 20 }, { key: "bankAccountNumber", label: "銀行帳號", max: 50 }],
};
function DurationInput({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) {
  const [unit, setUnit] = useState(() => Number(value) % 60 === 0 ? 60 : 1);
  const [display, setDisplay] = useState(() => ({ canonical: value, text: String(Number(value) / unit) }));
  const text = display.canonical === value ? display.text : value === "" ? "" : String(Number(value) / unit);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const minutes = Number(text) * unit;
    input.current?.setCustomValidity(text !== "" && Math.abs(minutes - Math.round(minutes)) > 0.000001 ? "請輸入可換算為整數分鐘的時間，例如 1.5 小時。" : "");
  }, [text, unit]);
  return <div className="min-w-0 text-sm"><label htmlFor={name} className="text-earth-700">{label}</label><div className="mt-1 flex items-center gap-2"><span className="shrink-0 text-earth-500">前</span>
    <input ref={input} id={name} name={name} type="number" required min={0} max={43200 / unit} step="any" value={text} onChange={event => {
      const next = event.target.value;
      const minutes = Number(next) * unit;
      const canonical = next === "" ? "" : String(Math.abs(minutes - Math.round(minutes)) < 0.000001 ? Math.round(minutes) : minutes);
      setDisplay({ canonical, text: next }); onChange(canonical);
    }} className="min-h-10 w-full min-w-0 rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm" />
    <select aria-label={`${label}單位`} value={unit} onChange={event => { const next = Number(event.target.value); setUnit(next); setDisplay({ canonical: value, text: value === "" ? "" : String(Number(value) / next) }); }} className="min-h-10 shrink-0 rounded-lg border border-earth-300 bg-white px-3 text-sm"><option value={60}>小時</option><option value={1}>分鐘</option></select>
  </div></div>;
}
type Props = {storeId:string;onSaved:(row:CourseSettingsSectionInput)=>void; initial: CourseSettingsSectionInput; onStatus: (section: CourseSettingsSectionInput["section"], dirty: boolean, pending: boolean) => void };
export function CourseSettingsSectionEditor({ storeId,initial, onStatus,onSaved }: Props) {
  const section = initial.section;
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).filter(([key]) => key !== "section").map(([key, value]) => [key, String(value)])));
  const [saved, setSaved] = useState(draft);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [message, setMessage] = useState("");
  const pathname=usePathname();
  const mutation=useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/course/section`,storeId,savedCourseSettingsSection);
  const pending=mutation.pending;
  const revision=useRef(courseSettingsSectionRevision(initial));
  const saving = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { onStatus(section, dirty, pending||mutation.uncertain); }, [section, dirty, pending, mutation.uncertain,onStatus]);
  const label = section === "store" ? "店家資料" : section === "booking" ? "預約截止規則" : "銀行資訊";
  return <form aria-label={`編輯${label}`} className={`${styles.root} m-0`} onSubmit={event => {
    event.preventDefault();
    if (saving.current || !dirty || !event.currentTarget.reportValidity()) return;
    saving.current = true;
    setMessage("");
    const input = section === "booking" ? { section, bookingLeadMinutes: Number(draft.bookingLeadMinutes), cancellationLeadMinutes: Number(draft.cancellationLeadMinutes) } : { ...draft, section };
    void mutation.save({values:input,expectedRevision:revision.current}).then(result=>{
      if(!result.success){setMessage(result.error);return;}
      const confirmed=Object.fromEntries(Object.entries(result.data.values).filter(([key])=>key!=="section").map(([key,value])=>[key,String(value)]));
      setDraft(confirmed);setSaved(confirmed);revision.current=result.data.revision;
      setConfirmDiscard(false);setMessage(result.syncWarning?"已儲存；其他頁面更新失敗，請重新整理核對。":"已儲存");onSaved(result.data.values);
    }).finally(()=>{saving.current=false;});
  }}>
    <fieldset disabled={pending||mutation.uncertain} className={`${styles.courseFields} ${section === "payment" ? `${styles.bankFields} items-end` : ""}`}>
      {fields[section].map(field => section === "booking" ? <DurationInput key={field.key} name={field.key} label={field.label} value={draft[field.key]} onChange={value => { setDraft(previous => ({ ...previous, [field.key]: value })); setMessage(""); }} /> : <label key={field.key} className={`min-w-0 text-sm text-earth-700 ${field.type === "url" ? styles.fullWidth : ""}`}>
        {field.label}<input name={field.key} type={field.type ?? "text"} value={draft[field.key]} required={field.key === "name" || field.type === "number"} min={field.type === "number" ? 0 : undefined} max={field.type === "number" ? 43200 : undefined} maxLength={field.max} step={field.type === "number" ? 1 : undefined} onChange={event => { setDraft(previous => ({ ...previous, [field.key]: event.target.value })); setMessage(""); }} className="mt-1 min-h-10 w-full min-w-0 rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-900" />
      </label>)}
    </fieldset>
    {message && <p role="status" className="mt-2 text-sm text-primary-700">{message}</p>}
    {confirmDiscard && <div role="alert" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm"><p>尚有未儲存內容，要捨棄本區修改嗎？</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setConfirmDiscard(false)} className="min-h-10 rounded border px-3 text-sm">繼續編輯</button><button type="button" onClick={() => { setDraft(saved); setConfirmDiscard(false); setMessage(""); }} className="min-h-10 rounded border px-3 text-sm">捨棄本區修改</button></div></div>}
    <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-earth-100 bg-white py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <span className="mr-auto text-sm text-earth-500">{pending ? "儲存中…" : dirty ? "未儲存" : ""}</span>
      <button type="button" disabled={pending || mutation.uncertain || !dirty} onClick={() => setConfirmDiscard(true)} className="min-h-10 min-w-24 shrink-0 whitespace-nowrap rounded-lg border px-3 text-sm disabled:opacity-40">取消</button>
      <button type="submit" disabled={pending || !dirty} className="min-h-10 min-w-24 shrink-0 whitespace-nowrap rounded-lg bg-primary-700 px-3 text-sm text-white disabled:opacity-30">{pending ? "儲存中…" : mutation.uncertain ? "重試確認儲存結果" : "儲存"}</button>
    </div>
  </form>;
}

