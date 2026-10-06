"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ModalPanel } from "@/components/admin/modal-panel";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { toLocalDateStr } from "@/lib/date-utils";
import { LABOR_PRODUCT_ID, workOrderNumber, workOrderSettlementPlan, type WorkOrderSettlementInput, type WorkOrderView } from "@/lib/work-orders";
import { loadWorkOrders, settleWorkOrderAction } from "@/server/actions/work-orders";

const control="min-h-11 min-w-0 rounded-md border border-earth-200 bg-white px-3 py-2 text-sm disabled:opacity-50";
const money=(n:number)=>`$${n.toLocaleString("zh-TW")}`;
const readOrder=(id:string)=>loadWorkOrders({query:id,page:1,status:"all",payment:"all"});
type Draft=Pick<WorkOrderSettlementInput,"date"|"reason"|"labor"|"refund"|"method"|"materials">;
export function WorkOrderSettlementPanel({initial,kind,storeId,onClose,onSaved}:{initial:WorkOrderView;kind:"CANCEL"|"REFUND";storeId:string;onClose:()=>void;onSaved:()=>Promise<void>}){
  const reader=usePanelReader("work-order-settlement",readOrder,`${storeId}:${initial.id}:${initial.revision}`,0);
  const [order,setOrder]=useState<WorkOrderView|null>(null),[draft,setDraft]=useState<Draft|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  const [discarding,setDiscarding]=useState(false);
  const [rights,setRights]=useState({collect:false,materials:false,price:false});
  const baseline=useRef(""),requestId=useRef(""),locked=useRef(false);
  useEffect(()=>{
    let active=true;
    void reader.read(initial.id).then(result=>{
      if(!active)return;
      if(!result.success){setError(result.error||"讀取失敗");return;}
      const latest=result.data.orders.find(o=>o.id===initial.id);
      if(!latest||!result.data.canWrite){setError("工單不存在或沒有操作權限");return;}
      const next:Draft={date:toLocalDateStr(),reason:"",labor:kind==="CANCEL"?0:latest.lines.find(l=>l.productId===LABOR_PRODUCT_ID)?.total??0,refund:0,method:"現金",materials:latest.lines.filter(l=>l.productId!==LABOR_PRODUCT_ID).map(l=>({productId:l.productId,returned:0,charge:l.total}))};
      next.refund=Math.max(0,latest.paid-next.labor-next.materials.reduce((n,l)=>n+l.charge,0));
      baseline.current=JSON.stringify(next);requestId.current=crypto.randomUUID();setOrder(latest);setDraft(next);setRights({collect:result.data.canCollect,materials:result.data.canProducts,price:result.data.canPriceOverride});
    }).catch(()=>{if(active)setError("讀取失敗，請重試");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[reader,initial.id,kind,attempt]);
  function close(){if(busy)return;if(draft&&JSON.stringify(draft)!==baseline.current){setDiscarding(true);return;}onClose();}
  function update(patch:Partial<Draft>){setDraft(old=>old?{...old,...patch}:old);}
  function changeCharges(patch:Partial<Draft>){if(!draft||!order)return;const next={...draft,...patch};next.refund=Math.max(0,order.paid-next.labor-next.materials.reduce((n,l)=>n+l.charge,0));setDraft(next);}
  const total=draft?draft.labor+draft.materials.reduce((n,l)=>n+l.charge,0):0;
  let invalid="";
  if(order&&draft)try{workOrderSettlementPlan(order.lines,order.paid,draft);if(draft.refund>Math.max(0,order.total-total))invalid="退款不可超過本次減收金額";if(kind==="REFUND"&&draft.refund===0)invalid="請調整保留費用及退款金額";}catch(e){invalid=e instanceof Error?e.message:"請確認金額";}
  async function submit(e:FormEvent){
    e.preventDefault();if(!order||!draft||locked.current||invalid||discarding)return;
    locked.current=true;setBusy(true);setError("");
    try{const result=await settleWorkOrderAction({...draft,kind,id:order.id,revision:order.revision,requestId:requestId.current});if(!result.success){setError(result.error||"操作失敗");return;}reader.clear();await onSaved();}
    catch{setError("連線中斷，請重試；同一筆送出不會重複退款或回補庫存");}finally{locked.current=false;setBusy(false);}
  }
  return <ModalPanel open onClose={close} pending={busy} labelledById="work-order-settlement" width={800}><div className="min-w-0 space-y-3 p-4 text-sm">
    <h2 id="work-order-settlement" className="admin-page-title">{kind==="CANCEL"?"取消工單／不維修":"退款"}・{workOrderNumber(initial)}</h2>
    <p>{initial.partyName}・{initial.partyPhone}</p>
    {loading?<p role="status">正在確認最新金額與材料…</p>:order&&draft?<form onSubmit={submit} className="min-w-0 space-y-3"><fieldset disabled={busy} className="min-w-0 space-y-3">
      <label className="flex flex-col gap-1">{kind==="CANCEL"?"取消原因":"退款原因"}<textarea required maxLength={1000} rows={2} className={control} value={draft.reason} onChange={e=>update({reason:e.target.value})}/></label>
      <label className="flex flex-col gap-1">保留檢測／工費<input type="number" min={0} step={1} required className={control} value={draft.labor} onChange={e=>changeCharges({labor:Number(e.target.value)})}/></label>
      {draft.materials.length>0&&<section aria-label="退回材料" className="min-w-0 space-y-2"><p>材料：只填實際未使用、可退回的數量；已使用的保留 0。</p><div className="max-w-full overflow-x-auto"><table className="w-full min-w-[540px] text-left"><thead className="bg-earth-50"><tr>{["材料","原數量","退回庫存","保留材料費"].map(t=><th key={t} className="px-2 py-2 font-normal">{t}</th>)}</tr></thead><tbody>{draft.materials.map(choice=>{
        const line=order.lines.find(l=>l.productId===choice.productId)!;
        return <tr key={choice.productId} className="border-t border-earth-100"><td className="max-w-64 break-words p-2">{line.name}{line.gift?"・贈品":""}</td><td className="p-2">{line.quantity}</td><td className="p-1"><input aria-label={`${line.name} 退回庫存`} type="number" min={0} max={line.quantity} step={1} required disabled={!rights.materials} className={`${control} w-24`} value={choice.returned} onChange={e=>{const returned=Number(e.target.value);changeCharges({materials:draft.materials.map(c=>c===choice?{...c,returned,charge:Math.max(0,Math.round(line.total*(line.quantity-returned)/line.quantity))}:c)});}}/></td><td className="p-1"><input aria-label={`${line.name} 保留材料費`} type="number" min={0} max={Math.min(line.total,line.unitPrice*(line.quantity-choice.returned))} step={1} required readOnly={!rights.price||line.gift} className={`${control} w-28`} value={choice.charge} onChange={e=>changeCharges({materials:draft.materials.map(c=>c===choice?{...c,charge:Number(e.target.value)}:c)})}/></td></tr>;
      })}</tbody></table></div></section>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="flex flex-col gap-1">處理日期<input type="date" required className={control} value={draft.date} onChange={e=>update({date:e.target.value})}/></label>{order.paid>0&&<><label className="flex flex-col gap-1">本次退款<input type="number" min={Math.max(0,order.paid-total)} max={Math.min(order.paid,Math.max(0,order.total-total))} step={1} required disabled={!rights.collect} className={control} value={draft.refund} onChange={e=>update({refund:Number(e.target.value)})}/></label><label className="flex flex-col gap-1">退款方式<select className={control} value={draft.method} onChange={e=>update({method:e.target.value as Draft["method"]})}>{["現金","轉帳","其他"].map(m=><option key={m}>{m}</option>)}</select></label></>}</div>
      <div className="grid grid-cols-3 gap-2 border-t border-earth-200 pt-3"><p>新應收<br/><b>{money(total)}</b></p><p>淨已收<br/><b>{money(order.paid-draft.refund)}</b></p><p>尚欠<br/><b>{money(total-order.paid+draft.refund)}</b></p></div>
      <p className="text-earth-600">送出後保留原工單與收款紀錄，只回補以上填寫的退回數量。</p>
      {invalid&&<p role="alert" className="text-amber-700">{invalid}</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}
      {discarding?<div role="alert" className="space-y-2 rounded-md border border-amber-200 p-3"><p>尚有未送出的內容，確定放棄並返回工單？</p><div className="flex flex-wrap justify-end gap-2"><button type="button" className={control} onClick={()=>setDiscarding(false)}>繼續編輯</button><button type="button" className={control} onClick={onClose}>放棄變更並返回</button></div></div>:<div className="flex flex-wrap justify-end gap-2"><button type="button" className={control} onClick={close}>返回工單</button><button className={`${control} bg-primary-700 text-white`} disabled={!!invalid||(draft.refund>0&&!rights.collect)}>{busy?"處理中…":kind==="CANCEL"?"確認取消／退款":"確認退款"}</button></div>}
    </fieldset></form>:<><p role="alert" className="text-red-700">{error}</p><button className={control} onClick={()=>{setError("");setLoading(true);setAttempt(n=>n+1);}}>重試</button></>}
    {loading&&<button className={control} onClick={close}>返回工單</button>}
  </div></ModalPanel>;
}
