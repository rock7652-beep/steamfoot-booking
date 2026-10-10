"use client";
import { useRef, useState, useTransition } from "react";
import { useConfirmedSettingsRows } from "@/components/admin/use-confirmed-settings-rows";
import { usePathname } from "next/navigation";
import { useSettingsSave } from "@/components/admin/use-settings-save";
import { savedSpaLocation, spaLocationRevision } from "@/lib/spa-settings-save";

type Location = {id?:string;revision?:string;name:string;isActive:boolean;treatmentIds:string[]};
export function LocationWorkspace({storeId,locations:sourceLocations,treatments,readOnly=false}:{storeId:string;locations:Location[];treatments:{id:string;name:string}[];readOnly?:boolean}) {
  const pathname=usePathname();
  const prefix=pathname.slice(0,pathname.indexOf("/dashboard"));
  const mutation=useSettingsSave(`${prefix}/dashboard/settings-save/spa/location`,storeId,savedSpaLocation);
  const {rows:locations,confirm}=useConfirmedSettingsRows(sourceLocations,spaLocationRevision);
  const saving=useRef(false);
  const [draft,setDraft]=useState<Location|null>(null); const [error,setError]=useState(""); const [pending,startTransition]=useTransition();
  function open(value:Location){mutation.reset();setDraft({...value,revision:value.id?spaLocationRevision(value):undefined,treatmentIds:[...value.treatmentIds]});setError("");}
  return <main className="w-full min-w-0 py-2">
    <header className="mb-3 flex items-center justify-between"><div><h1 className="admin-page-title">服務位置</h1><p className="mt-2 text-sm text-earth-500">{readOnly?"查看此店的服務位置與適用療程。":"管理美容床、美甲桌、美足椅等位置，以及可使用的療程。"}</p></div>{!readOnly&&<button className="rounded-xl bg-earth-800 px-4 py-3 text-white" onClick={()=>open({name:"",isActive:true,treatmentIds:[]})}>新增位置</button>}</header>
    <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white"><table className="admin-list-table w-full min-w-[560px] text-left text-sm"><thead className="bg-earth-100 text-earth-600"><tr><th className="p-3">服務位置</th><th className="p-3">適用療程</th><th className="p-3">狀態</th>{!readOnly&&<th className="p-3">操作</th>}</tr></thead><tbody>{locations.map(l=><tr key={l.id} className="border-t border-earth-100"><td className="p-3 font-semibold">{l.name}</td><td className="p-3 text-earth-500">{treatments.filter(t=>l.treatmentIds.includes(t.id)).map(t=>t.name).join("、")||"尚未指定適用療程"}</td><td className="p-3 whitespace-nowrap">{l.isActive?"啟用":"停用"}</td>{!readOnly&&<td className="p-3"><button className="rounded-lg border border-earth-200 px-3 py-2 whitespace-nowrap" onClick={()=>open(l)}>編輯</button></td>}</tr>)}</tbody></table>{locations.length===0&&<p className="p-6">尚未設定服務位置。</p>}</div>
    {!readOnly&&draft&&<div className="fixed inset-0 z-50 flex justify-end bg-black/30"><section role="dialog" aria-modal="true" aria-label="服務位置設定" className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"><div className="flex justify-between"><h2 className="text-xl font-bold">{draft.id?"編輯位置":"新增位置"}</h2><button disabled={pending} onClick={()=>setDraft(null)} aria-label="關閉">✕</button></div><form className="mt-6 space-y-5" onSubmit={e=>{e.preventDefault();if(saving.current)return;saving.current=true;setError("");startTransition(async()=>{try{const result=await mutation.save({...draft,expectedRevision:draft.revision});if(!result.success){setError(result.error||"儲存失敗");return;}confirm(result.data);setDraft(null);}catch{setError("連線失敗，內容已保留，請重試");}finally{saving.current=false;}});}}>
    <fieldset disabled={pending||mutation.uncertain} className="min-w-0 space-y-5"><label className="block">位置名稱<input required maxLength={60} className="mt-2 w-full rounded-lg border p-3" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label className="flex gap-2"><input type="checkbox" checked={draft.isActive} onChange={e=>setDraft({...draft,isActive:e.target.checked})}/>啟用此位置</label><p className="text-sm text-earth-500">停用後不再提供新預約選用，既有預約仍保留。</p>
    <fieldset><legend className="mb-3 font-semibold">適用療程</legend>{treatments.map(t=><label key={t.id} className="mb-3 flex gap-2"><input type="checkbox" checked={draft.treatmentIds.includes(t.id)} onChange={e=>setDraft({...draft,treatmentIds:e.target.checked?[...draft.treatmentIds,t.id]:draft.treatmentIds.filter(id=>id!==t.id)})}/>{t.name}</label>)}</fieldset>
    </fieldset>{error&&<p role="alert" className="text-red-600">{error}</p>}<button disabled={pending} className="w-full rounded-xl bg-earth-800 p-3 text-white disabled:opacity-50">{pending?"儲存中…":"儲存"}</button></form></section></div>}
  </main>;
}
