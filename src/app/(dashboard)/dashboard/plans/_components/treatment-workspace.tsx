"use client";

import { useState } from "react";

type TreatmentRow = {
  id: string;
  name: string;
  variant: string;
  price: number;
  serviceMinutes: number;
  bufferMinutes: number;
  skills: string[];
  publicVisible: boolean;
};

const INITIAL_TREATMENTS: TreatmentRow[] = [
  { id: "body-60", name: "全身芳療", variant: "60 分鐘", price: 1800, serviceMinutes: 60, bufferMinutes: 15, skills: ["身體芳療"], publicVisible: true },
  { id: "body-90", name: "全身芳療", variant: "90 分鐘", price: 2500, serviceMinutes: 90, bufferMinutes: 15, skills: ["身體芳療"], publicVisible: true },
  { id: "head-30", name: "頭部舒壓", variant: "30 分鐘", price: 800, serviceMinutes: 30, bufferMinutes: 10, skills: ["頭部／肩頸"], publicVisible: true },
  { id: "foot-30", name: "足部放鬆", variant: "30 分鐘", price: 800, serviceMinutes: 30, bufferMinutes: 10, skills: ["足部療程"], publicVisible: true },
  { id: "face-60", name: "臉部保濕護理", variant: "60 分鐘", price: 2000, serviceMinutes: 60, bufferMinutes: 15, skills: ["臉部保養"], publicVisible: false },
];

const SKILLS = ["身體芳療", "頭部／肩頸", "足部療程", "臉部保養"];

export function TreatmentWorkspace() {
  const [treatments, setTreatments] = useState(INITIAL_TREATMENTS);
  const [editing, setEditing] = useState<TreatmentRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function save(next: TreatmentRow) {
    setTreatments((current) => current.map((item) => item.id === next.id ? next : item));
    setEditing(null);
    setNotice("Demo 療程已更新；重新整理會還原，不會寫入正式門市");
  }

  return <div className="space-y-4">
    <section className="rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3">
      <h2 className="text-sm font-semibold text-earth-900">療程決定金額、時間與誰能服務</h2>
      <p className="mt-1 text-xs text-earth-600">儲值金只在結帳時扣款；不再用方案或堂數決定預約占用時間。</p>
    </section>
    {notice ? <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{notice}</div> : null}
    <section className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(220px,1.5fr)_100px_110px_120px_minmax(160px,1fr)_90px] gap-3 border-b border-earth-200 bg-earth-50 px-4 py-3 text-xs font-semibold text-earth-500">
        <span>療程</span><span>售價</span><span>顧客時間</span><span>實際占用</span><span>需要專業</span><span></span>
      </div>
      <div className="divide-y divide-earth-100">
        {treatments.map((item) => <div key={item.id} className="grid grid-cols-[minmax(220px,1.5fr)_100px_110px_120px_minmax(160px,1fr)_90px] items-center gap-3 px-4 py-4 text-sm">
          <div><p className="font-semibold text-earth-900">{item.name}</p><p className="mt-0.5 text-xs text-earth-500">{item.variant}・{item.publicVisible ? "顧客可預約" : "僅店內安排"}</p></div>
          <span className="tabular-nums text-earth-800">${item.price.toLocaleString()}</span>
          <span>{item.serviceMinutes} 分鐘</span>
          <span>{item.serviceMinutes + item.bufferMinutes} 分鐘<p className="text-[11px] text-earth-400">含整理 {item.bufferMinutes} 分</p></span>
          <div className="flex flex-wrap gap-1">{item.skills.map((skill) => <span key={skill} className="rounded-full bg-primary-50 px-2 py-1 text-[11px] text-primary-800">{skill}</span>)}</div>
          <button type="button" onClick={() => setEditing({ ...item, skills: [...item.skills] })} className="rounded-lg border border-earth-200 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-50">設定</button>
        </div>)}
      </div>
    </section>
    <section className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-earth-900">堂數權益與儲值金</h2>
      <p className="mt-1 text-xs text-earth-500">既有堂數方案會保留為顧客權益；儲值金將使用獨立金額帳本，不與療程設定混在一起。</p>
    </section>
    {editing ? <TreatmentDrawer treatment={editing} onClose={() => setEditing(null)} onSave={save} /> : null}
  </div>;
}

function TreatmentDrawer({ treatment, onClose, onSave }: { treatment: TreatmentRow; onClose: () => void; onSave: (value: TreatmentRow) => void }) {
  const [draft, setDraft] = useState(treatment);
  const inputClass = "mt-1 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200";
  function toggleSkill(skill: string) { setDraft((current) => ({ ...current, skills: current.skills.includes(skill) ? current.skills.filter((item) => item !== skill) : [...current.skills, skill] })); }
  return <div className="fixed inset-0 z-50 flex justify-end"><button type="button" aria-label="關閉" onClick={onClose} className="absolute inset-0 bg-earth-950/25" /><aside role="dialog" aria-modal="true" className="relative h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl"><header className="mb-5 flex items-center justify-between"><h1 className="text-lg font-semibold text-earth-900">設定療程</h1><button type="button" onClick={onClose} className="rounded-lg p-2 text-earth-500 hover:bg-earth-100">✕</button></header><div className="space-y-4"><label className="block text-sm font-medium text-earth-700">療程名稱<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass} /></label><label className="block text-sm font-medium text-earth-700">規格<input value={draft.variant} onChange={(event) => setDraft({ ...draft, variant: event.target.value })} className={inputClass} /></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium text-earth-700">售價<input type="number" min="0" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} className={inputClass} /></label><label className="block text-sm font-medium text-earth-700">服務時間<input type="number" min="5" step="5" value={draft.serviceMinutes} onChange={(event) => setDraft({ ...draft, serviceMinutes: Number(event.target.value) })} className={inputClass} /></label></div><label className="block text-sm font-medium text-earth-700">整理時間<input type="number" min="0" step="5" value={draft.bufferMinutes} onChange={(event) => setDraft({ ...draft, bufferMinutes: Number(event.target.value) })} className={inputClass} /><span className="mt-1 block text-xs font-normal text-earth-400">顧客不會看到，但系統會保留這段時間。</span></label><div><p className="text-sm font-medium text-earth-700">需要的專業項目</p><div className="mt-2 grid grid-cols-2 gap-2">{SKILLS.map((skill) => <button key={skill} type="button" onClick={() => toggleSkill(skill)} className={`rounded-lg border px-3 py-2.5 text-sm ${draft.skills.includes(skill) ? "border-primary-500 bg-primary-50 text-primary-800" : "border-earth-200 text-earth-600"}`}>{draft.skills.includes(skill) ? "✓ " : ""}{skill}</button>)}</div></div><label className="flex items-center justify-between rounded-lg border border-earth-200 px-3 py-3 text-sm text-earth-700"><span>開放顧客自行預約</span><input type="checkbox" checked={draft.publicVisible} onChange={(event) => setDraft({ ...draft, publicVisible: event.target.checked })} /></label></div><div className="mt-6 flex justify-end gap-2 border-t border-earth-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg border border-earth-300 px-4 py-2 text-sm text-earth-700">取消</button><button type="button" disabled={!draft.name || draft.serviceMinutes <= 0 || draft.skills.length === 0} onClick={() => onSave(draft)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-earth-300">儲存療程</button></div></aside></div>;
}
