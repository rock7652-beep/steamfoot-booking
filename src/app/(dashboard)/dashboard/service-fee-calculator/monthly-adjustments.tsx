"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalPanel } from "@/components/admin/modal-panel";
import { RosterTable } from "@/components/admin/roster-table";
import { toLocalDateStr } from "@/lib/date-utils";
import { adjustmentTotals, type MonthlyAdjustment } from "@/lib/staff-monthly-adjustment";
import { saveMonthlyAdjustment, deleteMonthlyAdjustment, changeAdjustmentMonthLock } from "@/server/actions/staff-monthly-adjustment";
const field="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";
const button="min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
const money=(n:number)=>`$${n.toLocaleString("zh-TW")}`;
export function MonthlyAdjustments({storeId,month,rows,people,canEdit,locked,revision,confirmInReport=false}:{storeId:string;month:string;rows:MonthlyAdjustment[];people:{id:string;name:string;active:boolean}[];canEdit:boolean;locked:boolean;revision:number;confirmInReport?:boolean}) {
  const router=useRouter(),busy=useRef(false),initialDraft=useRef(""),[pending,start]=useTransition();
  const [draft,setDraft]=useState<MonthlyAdjustment|null>(null),[deleting,setDeleting]=useState<MonthlyAdjustment|null>(null),[message,setMessage]=useState("");
  const [query,setQuery]=useState("");
  const names=new Map(people.map(p=>[p.id,p.name]));
  const visible=rows.filter(r=>`${names.get(r.staffId)??""} ${r.reason}`.includes(query.trim()));
  const totals=adjustmentTotals(visible);
  function run(action:()=>Promise<{success:boolean;error?:string}>,done?:()=>void){
    if(busy.current)return;busy.current=true;setMessage("");
    start(async()=>{try{const result=await action();if(result.success){done?.();setMessage("已儲存");router.refresh();}else setMessage(result.error??"操作失敗");}catch{setMessage("連線未完成，請保留內容並重試。");}finally{busy.current=false;}});
  }
  function openDraft(value:MonthlyAdjustment){initialDraft.current=JSON.stringify(value);setDraft(value);}
  function close(){if(pending)return;if(draft&&JSON.stringify(draft)!==initialDraft.current&&!window.confirm("關閉並捨棄尚未儲存的內容？"))return;setDraft(null);}
  return <section className="min-w-0 space-y-3 rounded-lg border border-earth-200 bg-white p-3" aria-label="獎勵與調整">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">獎勵與調整</h2><div className="flex flex-wrap gap-2">
      {canEdit&&!locked&&<button className={button} disabled={pending} onClick={()=>{setMessage("");openDraft({id:crypto.randomUUID(),revision:0,staffId:"",month,date:toLocalDateStr(),direction:"ADD",amount:0,reason:""});}}>＋新增調整</button>}
      {canEdit&&(locked||!confirmInReport)&&<button className={button} disabled={pending} onClick={()=>{if(window.confirm(locked?`重新開啟 ${month} 月結？修改後請再完成月結。`:`確認完成 ${month} 月結？調整明細將鎖定。`))run(()=>changeAdjustmentMonthLock({expectedStoreId:storeId,month,revision,locked:!locked}));}}>{locked?"重新開啟月結":"完成月結"}</button>}
    </div></div>
    {locked&&<p className="text-sm text-earth-600">此月份已結算，明細可查看；需修改時先重新開啟月結。</p>}
    <label className="block max-w-sm text-sm">搜尋人員／事由<input type="search" className={field} value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <p className="flex flex-wrap gap-4 text-sm"><span>加項合計 +{money(totals.addition)}</span><span>減項合計 −{money(totals.deduction)}</span><span>調整淨額 {totals.net<0?"−":"+"}{money(Math.abs(totals.net))}</span></p>
    <RosterTable label="調整明細" columns={["日期","人員","調整事由","加項","減項","操作"]} widths={["13%","14%","31%","12%","12%","18%"]}>
      {visible.map(r=><tr key={r.id}><td>{r.date}</td><td>{names.get(r.staffId)??"歷史人員"}</td><td className="whitespace-pre-wrap">{r.reason}</td><td className="tabular-nums">{r.direction==="ADD"?`+${money(r.amount)}`:"—"}</td><td className="tabular-nums">{r.direction==="SUBTRACT"?`−${money(r.amount)}`:"—"}</td><td>{canEdit&&!locked&&<div className="flex flex-wrap gap-2"><button className={button} disabled={pending} onClick={()=>{setMessage("");openDraft({...r});}}>編輯</button><button className={button} disabled={pending} onClick={()=>{setMessage("");setDeleting(r);}}>刪除</button></div>}</td></tr>)}
      {!visible.length&&<tr><td colSpan={6}>{query?"沒有符合條件的明細。":"本月尚無調整紀錄。"}</td></tr>}
    </RosterTable>
    {!draft&&!deleting&&message&&<p role="status" className="text-sm">{message}</p>}
    <ModalPanel open={!!draft} onClose={close} labelledById="monthly-adjustment-title" pending={pending} width={560}>
      {draft&&<form className="space-y-3 p-4" onSubmit={e=>{e.preventDefault();run(()=>saveMonthlyAdjustment({...draft,expectedStoreId:storeId}),()=>setDraft(null));}}>
        <h3 id="monthly-adjustment-title" className="font-medium">{draft.revision?"編輯調整":"新增調整"}</h3>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">日期＊<input required type="date" className={field} disabled={pending} value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value,month:e.target.value.slice(0,7)})}/></label><label className="block text-sm">歸屬月份＊<input required type="month" className={field} disabled={pending} value={draft.month} onChange={e=>setDraft({...draft,month:e.target.value})}/></label></div>
        <label className="block text-sm">人員＊<select required className={field} disabled={pending} value={draft.staffId} onChange={e=>setDraft({...draft,staffId:e.target.value})}><option value="">請選擇人員</option>{people.filter(p=>p.active||p.id===draft.staffId).map(p=><option key={p.id} value={p.id}>{p.name}{!p.active?"（已停用）":""}</option>)}</select></label>
        <label className="block text-sm">加項／減項＊<select className={field} disabled={pending} value={draft.direction} onChange={e=>setDraft({...draft,direction:e.target.value as "ADD"|"SUBTRACT"})}><option value="ADD">加項 ＋</option><option value="SUBTRACT">減項 －</option></select></label>
        <label className="block text-sm">金額＊<input required type="number" min={1} max={10000000} step={1} className={field} disabled={pending} value={draft.amount||""} onChange={e=>setDraft({...draft,amount:Number(e.target.value)})}/></label>
        <label className="block text-sm">調整事由＊<textarea required maxLength={500} className={field} disabled={pending} placeholder="例如：教學獎勵、出勤調整及計算依據" value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label>
        {draft.month!==month&&<p className="text-sm">儲存後計入 {draft.month} 月結，本頁仍顯示 {month}。</p>}
        <div className="flex gap-2"><button className={`${button} bg-primary-700 text-white`} disabled={pending}>{pending?"儲存中…":"儲存"}</button><button type="button" className={button} disabled={pending} onClick={close}>取消</button></div>
        {message&&<p role="alert" className="text-sm">{message}</p>}
      </form>}
    </ModalPanel>
    <ModalPanel open={!!deleting} onClose={()=>setDeleting(null)} labelledById="monthly-adjustment-delete" pending={pending}>
      {deleting&&<div className="space-y-3 p-4"><h3 id="monthly-adjustment-delete">刪除這筆調整？</h3><p>{names.get(deleting.staffId)} · {deleting.reason} · {money(deleting.amount)}</p><p className="text-sm">刪除後將更新 {deleting.month} 月結金額，畫面無法直接復原。</p><div className="flex gap-2"><button className={button} disabled={pending} onClick={()=>run(()=>deleteMonthlyAdjustment({id:deleting.id,revision:deleting.revision,expectedStoreId:storeId}),()=>setDeleting(null))}>{pending?"刪除中…":"確認刪除"}</button><button className={button} disabled={pending} onClick={()=>setDeleting(null)}>取消</button></div>{message&&<p role="alert">{message}</p>}</div>}
    </ModalPanel>
  </section>;
}
