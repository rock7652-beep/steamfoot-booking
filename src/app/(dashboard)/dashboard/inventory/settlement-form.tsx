"use client";
import { useState } from "react";
import { toLocalDateStr } from "@/lib/date-utils";
import { settlementPlan, type SettlementInput } from "@/lib/inventory-settlement";
import type { InventoryData, InventoryOrderView, InventoryPaymentView } from "@/lib/inventory";
import styles from "./workspace.module.css";
const money=(n:number)=>`$${n.toLocaleString("zh-TW")}`;
function ReasonField({value,onChange,pending,correction=false}:{value:string;onChange:(v:string)=>void;pending:boolean;correction?:boolean}) {
 const options=correction?["付款方式誤登","重複記帳","其他"]:["商品瑕疵","顧客取消","換貨","其他"];
 const [choice,setChoice]=useState(""),[note,setNote]=useState("");
 const change=(selected:string,detail:string)=>onChange(selected==="其他"?detail:[selected,detail].filter(Boolean).join("・"));
 return <div className={styles.field}><label>處理原因<select required value={choice} disabled={pending} onChange={e=>{setChoice(e.target.value);change(e.target.value,note);}}><option value="">請選擇原因</option>{options.map(v=><option key={v}>{v}</option>)}</select></label>
 {choice==="其他"?<label>原因說明<input required maxLength={950} value={note} disabled={pending} onChange={e=>{setNote(e.target.value);change(choice,e.target.value);}}/></label>:<details><summary>補充說明（選填）</summary><input aria-label="補充原因說明" maxLength={950} value={note} disabled={pending} onChange={e=>{setNote(e.target.value);change(choice,e.target.value);}}/></details>}
 <input type="hidden" value={value}/></div>;
}
export function SettlementForm({order,kind,data,requestId,pending,onDirty,onSubmit}:{order:InventoryOrderView;kind:SettlementInput["kind"];data:InventoryData;requestId:string;pending:boolean;onDirty:()=>void;onSubmit:(v:SettlementInput)=>void}){
 const [date,setDate]=useState(toLocalDateStr()),[reason,setReason]=useState(""),[method,setMethod]=useState<SettlementInput["method"]>("現金"),[refund,setRefund]=useState(0),[freight,setFreight]=useState(kind==="VOID"?order.freight:0),[exchangeOrderId,setExchange]=useState("");
 const [quantities,setQuantities]=useState<Record<string,number>>(Object.fromEntries(order.lines.map(l=>[l.productId,kind==="VOID"?l.quantity:0]))),[restock,setRestock]=useState<Record<string,boolean>>({});
 const v:SettlementInput={requestId,orderId:order.id,revision:order.revision,kind,date,reason,method,refund,freight,exchangeOrderId,lines:order.lines.filter(l=>(quantities[l.productId]??0)>0).map(l=>({productId:l.productId,quantity:quantities[l.productId],restock:restock[l.productId]??false}))};
 let plan:ReturnType<typeof settlementPlan>|null=null,error="";
 try{plan=settlementPlan(order.lines,order.freight,order.paid,v);}catch(e){error=e instanceof Error?e.message:"請確認資料";}
 const ceiling=(()=>{try{return settlementPlan(order.lines,order.freight,order.paid,{...v,kind:kind==="REFUND"?"RETURN":kind,refund:0,...(kind==="REFUND"?{kind:"REFUND" as const,refund:Math.max(0,order.paid-order.total)}:{})}).maximumRefund;}catch{return Math.max(0,order.paid-order.total);}})();
 return <form onSubmit={e=>{e.preventDefault();if(plan)onSubmit(v);}} className={styles.editor}>
 <p>{order.partyName}・原應收 {money(order.total)}・淨已收 {money(order.paid)}</p>
 {kind!=="REFUND"&&<div className={styles.table}><table><thead><tr><th>商品</th><th>尚可退</th><th>本次退貨</th><th>放回庫存</th></tr></thead><tbody>{order.lines.map(l=><tr key={l.productId}><td>{l.name}{l.gift?"・贈品":""}</td><td>{l.quantity}</td><td><input aria-label={`${l.name}退貨數量`} type="number" min="0" max={l.quantity} step="1" value={quantities[l.productId]} disabled={pending||kind==="VOID"} onChange={e=>setQuantities({...quantities,[l.productId]:Number(e.target.value)})}/></td><td><label className={styles.checkbox}><input type="checkbox" disabled={pending||!quantities[l.productId]} checked={restock[l.productId]??false} onChange={e=>setRestock({...restock,[l.productId]:e.target.checked})}/>可再次販售，放回庫存</label></td></tr>)}</tbody></table></div>}
 <div className={styles.fields}>
 {kind!=="REFUND"&&order.freight>0&&<label className={styles.field}>退還運費<input type="number" min="0" max={order.freight} step="1" value={freight} disabled={pending||kind==="VOID"} onChange={e=>setFreight(Number(e.target.value))}/></label>}
 <div className={styles.wide}>
 <div className={styles.fields}>
 <div className={styles.field}><label htmlFor="settlement-refund">本次實際退款</label><input id="settlement-refund" type="number" min="0" max={ceiling} step="1" value={refund} disabled={pending} onChange={e=>setRefund(Number(e.target.value))}/><div className={styles.toolbar}><span>可退 {money(ceiling)}</span><button type="button" disabled={pending||ceiling<=0} onClick={()=>{setRefund(ceiling);onDirty();}}>填入全額退款</button></div><span>尚未退錢填 0</span></div>
 <label className={styles.field}>退款方式<select value={method} disabled={pending} onChange={e=>setMethod(e.target.value as SettlementInput["method"])}>{["現金","轉帳","其他"].map(m=><option key={m}>{m}</option>)}</select></label>
 </div>
 {plan?<p role="status"><strong>{plan.pendingRefund>0?`本次處理後尚需退款 ${money(plan.pendingRefund)}`:plan.remaining>0?`本次處理後顧客尚欠 ${money(plan.remaining)}`:"本次處理後款項已結清"}</strong></p>:<p role="alert">{error}</p>}
 </div>
 <label className={styles.field}>處理日期<input type="date" min={order.date} max={toLocalDateStr()} value={date} required disabled={pending} onChange={e=>setDate(e.target.value)}/></label>
 <ReasonField value={reason} onChange={setReason} pending={pending}/>
 {kind==="RETURN"&&<details className={styles.wide}><summary>換貨關聯（選填）</summary><p className={styles.sub}>先建立新銷貨單，再選擇關聯；兩張單分別結清。</p><label className={styles.field}>換貨新單<select value={exchangeOrderId} disabled={pending} onChange={e=>setExchange(e.target.value)}><option value="">未換貨</option>{data.orders.filter(o=>o.id!==order.id&&o.partyId===order.partyId&&o.kind==="SALE"&&!o.voided&&!o.workOrder).map(o=><option key={o.id} value={o.id}>{o.date}・{o.id.slice(-8)}・{money(o.total)}</option>)}</select></label></details>}
 </div>
 <p className={styles.sub}>確認後保留原單與處理紀錄，不能直接刪除。</p>
 <button className={styles.primary} type="submit" disabled={pending||!plan||!reason.trim()}>{pending?"處理中…":"確認"+(kind==="VOID"?"作廢":kind==="REFUND"?"退款":"退貨")}</button>
 </form>;
}
export function CorrectionForm({payment,data,requestId,pending,onSubmit}:{payment:InventoryPaymentView;data:InventoryData;requestId:string;pending:boolean;onSubmit:(v:unknown)=>void}){
 const [date,setDate]=useState(toLocalDateStr()),[reason,setReason]=useState(""),[method,setMethod]=useState("");
 return <form className={styles.editor} onSubmit={e=>{e.preventDefault();onSubmit({requestId,paymentId:payment.id,date,reason,...(method&&method!=="VOID"?{method}:{})});}}>
 <p>原收款 {money(payment.total)}・{payment.method}。以下 {payment.allocations.length} 張單據全部同步處理，庫存不變。</p>
 {payment.allocations.map(a=><p key={a.orderId}>{data.orders.find(o=>o.id===a.orderId)?.partyName}・{a.orderId.slice(-8)}・{!method?"請選擇處理方式":method!=="VOID"?"欠款不變":`恢復尚欠 ${money(a.amount)}`}</p>)}
 <div className={styles.payment}><label className={styles.field}>處理日期<input type="date" min={payment.date} max={toLocalDateStr()} required value={date} disabled={pending} onChange={e=>setDate(e.target.value)}/></label>
 <label className={styles.field}>處理方式<select required value={method} disabled={pending} onChange={e=>setMethod(e.target.value)}><option value="" disabled>請選擇處理方式</option><option value="VOID">作廢收款紀錄（恢復欠款）</option>{["現金","轉帳","其他"].filter(m=>m!==payment.method).map(m=><option key={m} value={m}>更正為{m}（保留原收款金額）</option>)}</select></label>
 <ReasonField correction value={reason} onChange={setReason} pending={pending}/></div>
 <p role="status">{!method?"選擇更正付款方式或作廢收款紀錄。":method!=="VOID"?`沖回原${payment.method}紀錄並重新登錄${method} ${money(payment.total)}；欠款不變。`:`沖回收款紀錄 ${money(payment.total)}，恢復各單尚欠款。`}只修正收款紀錄，不會退款給顧客。</p>
 <button type="submit" className={styles.primary} disabled={pending||!method||!reason.trim()}>{pending?"處理中…":method==="VOID"?"確認作廢收款":"確認更正付款方式"}</button></form>;
}
