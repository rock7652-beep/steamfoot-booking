"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSpaLocation } from "@/server/actions/spa-resources";

type Location = {id?:string;name:string;isActive:boolean;treatmentIds:string[]};
export function LocationWorkspace({locations,treatments}:{locations:Location[];treatments:{id:string;name:string}[]}) {
  const router=useRouter(); const [draft,setDraft]=useState<Location|null>(null); const [error,setError]=useState(""); const [pending,startTransition]=useTransition();
  function open(value:Location){setDraft({...value,treatmentIds:[...value.treatmentIds]});setError("");}
  return <main className="mx-auto max-w-6xl p-6">
    <header className="mb-6 flex items-center justify-between"><div><h1 className="text-2xl font-bold">服務位置</h1><p className="mt-2 text-sm text-earth-500">管理美容床、美甲桌、美足椅等位置，以及可使用的療程。</p></div><button className="rounded-xl bg-earth-800 px-4 py-3 text-white" onClick={()=>open({name:"",isActive:true,treatmentIds:[]})}>新增位置</button></header>
    <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-earth-100 text-earth-600"><tr><th className="p-3">服務位置</th><th className="p-3">適用療程</th><th className="p-3">狀態</th><th className="p-3">操作</th></tr></thead><tbody>{locations.map(l=><tr key={l.id} className="border-t border-earth-100"><td className="p-3 font-semibold">{l.name}</td><td className="p-3 text-earth-500">{treatments.filter(t=>l.treatmentIds.includes(t.id)).map(t=>t.name).join("、")||"尚未指定適用療程"}</td><td className="p-3 whitespace-nowrap">{l.isActive?"啟用":"停用"}</td><td className="p-3"><button className="rounded-lg border border-earth-200 px-3 py-2 whitespace-nowrap" onClick={()=>open(l)}>編輯</button></td></tr>)}</tbody></table>{locations.length===0&&<p className="p-6">尚未設定服務位置，請新增第一個位置。</p>}</div>
    {draft&&<div className="fixed inset-0 z-50 flex justify-end bg-black/30"><section role="dialog" aria-modal="true" aria-label="服務位置設定" className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"><div className="flex justify-between"><h2 className="text-xl font-bold">{draft.id?"編輯位置":"新增位置"}</h2><button disabled={pending} onClick={()=>setDraft(null)} aria-label="關閉">✕</button></div><form className="mt-6 space-y-5" onSubmit={e=>{e.preventDefault();setError("");startTransition(async()=>{try{const result=await saveSpaLocation(draft);if(!result.success){setError(result.error||"儲存失敗");return;}setDraft(null);router.refresh();}catch{setError("連線失敗，內容已保留，請重試");}});}}>
    <label className="block">位置名稱<input required maxLength={60} className="mt-2 w-full rounded-lg border p-3" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label className="flex gap-2"><input type="checkbox" checked={draft.isActive} onChange={e=>setDraft({...draft,isActive:e.target.checked})}/>啟用此位置</label><p className="text-sm text-earth-500">停用後不再提供新預約選用，既有預約仍保留。</p>
    <fieldset><legend className="mb-3 font-semibold">適用療程</legend>{treatments.map(t=><label key={t.id} className="mb-3 flex gap-2"><input type="checkbox" checked={draft.treatmentIds.includes(t.id)} onChange={e=>setDraft({...draft,treatmentIds:e.target.checked?[...draft.treatmentIds,t.id]:draft.treatmentIds.filter(id=>id!==t.id)})}/>{t.name}</label>)}</fieldset>
    {error&&<p role="alert" className="text-red-600">{error}</p>}<button disabled={pending} className="w-full rounded-xl bg-earth-800 p-3 text-white disabled:opacity-50">{pending?"儲存中…":"儲存"}</button></form></section></div>}
  </main>;
}
