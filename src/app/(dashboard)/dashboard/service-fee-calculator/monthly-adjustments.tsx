"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalPanel } from "@/components/admin/modal-panel";
import { RosterTable } from "@/components/admin/roster-table";
import { toLocalDateStr } from "@/lib/date-utils";
import { adjustmentTotals, type MonthlyAdjustment, type MonthlyAdjustmentSnapshot } from "@/lib/staff-monthly-adjustment";
import { MonthlyAdjustmentProvider, useMonthlyAdjustmentState } from "@/components/operations/monthly-adjustment-context";
import { saveMonthlyAdjustment, deleteMonthlyAdjustment, changeAdjustmentMonthLock } from "@/server/actions/staff-monthly-adjustment";
const field="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";
const button="min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
const money=(n:number)=>`$${n.toLocaleString("zh-TW")}`;
type Props={integrated?:boolean;storeId:string;month:string;rows:MonthlyAdjustment[];people:{id:string;name:string;active:boolean}[];canEdit:boolean;locked:boolean;revision:number;confirmInReport?:boolean};
export function MonthlyAdjustments(props:Props) {
  const state=useMonthlyAdjustmentState();
  if(state)return <AdjustmentEditor {...props}/>;
  return <MonthlyAdjustmentProvider key={`${props.storeId}:${props.month}`} initial={{storeId:props.storeId,month:props.month,rows:props.rows,locked:props.locked,revision:props.revision}} people={props.people}><AdjustmentEditor {...props}/></MonthlyAdjustmentProvider>;
}
function AdjustmentEditor({storeId,month,people,canEdit,confirmInReport=false,integrated=false}:Props) {
  const state=useMonthlyAdjustmentState()!;
  const {rows,locked,revision}=state.snapshot;
  const router=useRouter(),busy=useRef(false),[pending,start]=useTransition();
  const {draft,deleting,initialDraft}=state.editor;
  const {setDraft,setDeleting,openDraft}=state;
  const [message,setMessage]=useState("");
  const [query,setQuery]=useState("");
  const names=new Map(people.map(p=>[p.id,p.name]));
  const visible=rows.filter(r=>`${names.get(r.staffId)??""} ${r.reason}`.includes(query.trim()));
  const totals=adjustmentTotals(visible);
  function run(action:()=>Promise<{success:boolean;error?:string;data?:MonthlyAdjustmentSnapshot}>,done?:()=>void){
    if(busy.current)return;busy.current=true;state.setEditorPending(true);setMessage("");
    start(async()=>{try{const result=await action();if(result.success){if(result.data&&state.apply(result.data)){done?.();setMessage("已儲存");}else setMessage("已儲存，正在同步明細，請勿重複新增。");router.refresh();}else setMessage(result.error??"操作失敗");}catch{setMessage("連線未完成，請保留內容並重試。");}finally{busy.current=false;state.setEditorPending(false);}});
  }
  function close(){if(pending)return;if(draft&&JSON.stringify(draft)!==initialDraft&&!window.confirm("關閉並捨棄尚未儲存的內容？"))return;setDraft(null);}
  return <section className={integrated?"contents":"min-w-0 space-y-2 rounded-lg border border-earth-200 bg-white p-3"} aria-label="獎勵與調整">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{!integrated&&<><h2 className="shrink-0 font-medium">獎勵與調整</h2><input type="search" aria-label="搜尋人員或備註" placeholder="搜尋人員或備註" className="min-h-11 min-w-0 flex-1 basis-48 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base sm:max-w-xs" value={query} onChange={e=>setQuery(e.target.value)}/></>}<div className="ml-auto flex flex-wrap gap-2">
      {canEdit&&!locked&&<button className={integrated?`${button} bg-primary-700 font-medium text-white`:button} disabled={pending} onClick={()=>{setMessage("");openDraft({id:crypto.randomUUID(),revision:0,staffId:"",month:toLocalDateStr().slice(0,7),date:toLocalDateStr(),direction:"ADD",amount:0,reason:""});}}>{integrated?"＋新增獎勵與調整":"＋新增調整"}</button>}
      {canEdit&&(locked||!confirmInReport)&&<button className={button} disabled={pending} onClick={()=>{if(window.confirm(locked?`重新開啟 ${month} 月結？修改後請再完成月結。`:`確認完成 ${month} 月結？調整明細將鎖定。`))run(()=>changeAdjustmentMonthLock({expectedStoreId:storeId,month,revision,locked:!locked}));}}>{locked?"重新開啟月結":"完成月結"}</button>}
    </div></div>
    {locked&&<p className="text-sm text-earth-600">此月份已結算，明細可查看；需修改時先重新開啟月結。</p>}
    {!integrated&&<><p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className="text-earth-500">{visible.length} 筆{query&&"符合搜尋"}</span><span>加項合計 +{money(totals.addition)}</span><span>減項合計 −{money(totals.deduction)}</span><span>調整淨額 {totals.net<0?"−":"+"}{money(Math.abs(totals.net))}</span>{!draft&&!deleting&&message&&<span role="status" className="text-earth-600">{message}</span>}</p>
    <RosterTable dense minWidth={760} label="調整明細" columns={["日期","人員","備註","加項","減項","操作"]} widths={["110px","110px","auto","100px","100px","120px"]}>
      {visible.map(r=><tr key={r.id}><td className="whitespace-nowrap tabular-nums">{r.date}</td><td>{names.get(r.staffId)??"歷史人員"}</td><td className="whitespace-pre-wrap">{r.reason}</td><td className="tabular-nums">{r.direction==="ADD"?`+${money(r.amount)}`:"—"}</td><td className="tabular-nums">{r.direction==="SUBTRACT"?`−${money(r.amount)}`:"—"}</td><td>{canEdit&&!locked&&<div className="flex gap-1"><button className="min-h-11 min-w-11 px-2 text-sm text-primary-700 disabled:opacity-50" disabled={pending} onClick={()=>{setMessage("");openDraft({...r});}}>編輯</button><button className="min-h-11 min-w-11 px-2 text-sm text-earth-600 disabled:opacity-50" disabled={pending} onClick={()=>{setMessage("");setDeleting(r);}}>刪除</button></div>}</td></tr>)}
      {!visible.length&&<tr><td colSpan={6}>{query?"沒有符合條件的明細。":"本月尚無調整紀錄。"}</td></tr>}
    </RosterTable></>}
    {integrated&&!draft&&!deleting&&message&&<p role="status" className="text-sm text-earth-600">{message}</p>}
    <ModalPanel open={!!draft&&canEdit&&!locked} onClose={close} labelledById="monthly-adjustment-title" pending={pending} width={520}>
      {draft&&<form className="space-y-3 p-4" onSubmit={e=>{e.preventDefault();run(()=>saveMonthlyAdjustment({...draft,expectedStoreId:storeId,viewMonth:month}),()=>setDraft(null));}}>
        <h3 id="monthly-adjustment-title" className="text-lg font-semibold text-primary-900">{draft.revision?"編輯獎勵與調整":"新增獎勵與調整"}</h3>
        <label className="block text-sm">日期 *<input required type="date" className={field} disabled={pending} value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value,month:e.target.value.slice(0,7)})}/></label>
        <label className="block text-sm">人員 *<select required className={field} disabled={pending} value={draft.staffId} onChange={e=>setDraft({...draft,staffId:e.target.value})}><option value="">請選擇人員</option>{people.filter(p=>p.active||p.id===draft.staffId).map(p=><option key={p.id} value={p.id}>{p.name}{!p.active?"（已停用）":""}</option>)}</select></label>
        <fieldset disabled={pending} className="min-w-0"><legend className="text-sm">調整方式 *</legend><div className="mt-1 grid grid-cols-2 gap-2">{([{value:'ADD',label:'＋增項'},{value:'SUBTRACT',label:'－減項'}] as const).map(option=><label key={option.value} className="min-w-0 cursor-pointer"><input type="radio" name="adjustment-direction" value={option.value} checked={draft.direction===option.value} onChange={()=>setDraft({...draft,direction:option.value})} className="peer sr-only"/><span className="flex min-h-11 items-center justify-center rounded-lg border border-earth-200 bg-white text-sm text-earth-600 peer-checked:border-primary-700 peer-checked:bg-primary-50 peer-checked:font-semibold peer-checked:text-primary-900 peer-focus-visible:outline-2 peer-focus-visible:outline-primary-600">{option.label}</span></label>)}</div></fieldset>
        <label className="block text-sm">金額 *<input required type="number" min={1} max={10000000} step={1} className={field} disabled={pending} value={draft.amount||""} onChange={e=>setDraft({...draft,amount:Number(e.target.value)})}/></label>
        <label className="block text-sm">備註 *<textarea required maxLength={500} className={field} disabled={pending} placeholder="請填寫獎勵或調整備註" value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label>
        {draft.month!==month&&<p className="text-sm">儲存後計入 {draft.month} 月結，本頁仍顯示 {month}。</p>}
        <div className="flex justify-end gap-2"><button type="button" className={button} disabled={pending} onClick={close}>取消</button><button className={`${button} bg-primary-700 text-white`} disabled={pending}>{pending?"儲存中…":"儲存"}</button></div>
        {message&&<p role="alert" className="text-sm">{message}</p>}
      </form>}
    </ModalPanel>
    <ModalPanel open={!!deleting&&canEdit&&!locked} onClose={()=>setDeleting(null)} labelledById="monthly-adjustment-delete" pending={pending}>
      {deleting&&<div className="space-y-3 p-4"><h3 id="monthly-adjustment-delete">刪除這筆調整？</h3><p>{names.get(deleting.staffId)} · {deleting.reason} · {money(deleting.amount)}</p><p className="text-sm">刪除後將更新 {deleting.month} 月結金額，畫面無法直接復原。</p><div className="flex gap-2"><button className={button} disabled={pending} onClick={()=>run(()=>deleteMonthlyAdjustment({id:deleting.id,revision:deleting.revision,expectedStoreId:storeId}),()=>setDeleting(null))}>{pending?"刪除中…":"確認刪除"}</button><button className={button} disabled={pending} onClick={()=>setDeleting(null)}>取消</button></div>{message&&<p role="alert">{message}</p>}</div>}
    </ModalPanel>
  </section>;
}
