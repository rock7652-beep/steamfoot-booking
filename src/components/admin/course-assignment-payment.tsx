"use client";
import {calculateCourseSaleAllocation} from "@/lib/course-sale-allocation";
import { useState } from "react";
import { calculateCourseCheckout, COURSE_PAYMENT_LABELS } from "@/lib/course-checkout";
export function CourseAssignmentPayment({price,canDiscount,storeCost=0}:{price:number;canDiscount:boolean;storeCost?:number}) {
 const [kind,setKind]=useState<"AMOUNT"|"PERCENT">("AMOUNT"),[value,setValue]=useState("0"),[method,setMethod]=useState("CASH");
 let total:null|ReturnType<typeof calculateCourseCheckout>=null;
 try {if(value!=="")total=calculateCourseCheckout(price,kind,Number(value));}catch{}
 return <fieldset className="grid grid-cols-1 gap-3 rounded-xl border border-earth-200 p-3 sm:grid-cols-2"><legend className="px-1 font-medium">結帳</legend>
 <input type="hidden" name="expectedStoreCost" value={storeCost}/><input type="hidden" name="expectedListPrice" value={price}/><p className="sm:col-span-2">方案售價 NT$ {price.toLocaleString()}</p>
 <label>優惠折扣<select name="discountKind" className="min-h-11 w-full rounded border p-2" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setValue("0");}} disabled={!canDiscount}><option value="AMOUNT">折抵金額（元）</option><option value="PERCENT">折抵比例（%）</option></select></label>
 <label>{kind==="AMOUNT"?"折抵多少元":"折抵百分比"}<input name="discountValue" aria-label="折抵數值" type="number" min="0" max={kind==="PERCENT"?100:price} step={kind==="PERCENT"?"0.01":"1"} required className="min-h-11 w-full rounded border p-2" value={value} onChange={e=>setValue(e.target.value)} readOnly={!canDiscount}/></label>
 {!canDiscount&&<><input type="hidden" name="discountKind" value="AMOUNT"/><p role="note" className="text-sm text-earth-600 sm:col-span-2">此帳號尚未開啟「使用折扣」權限，請由有權限的管理者在人員權限設定開啟。</p></>}
 {total?<p className="sm:col-span-2 font-semibold" role="status">折抵 NT$ {total.discount.toLocaleString()} · 實收 NT$ {total.paid.toLocaleString()}{total.paid===0?" · 全額折抵":""}</p>:<p role="alert">請輸入有效折抵金額或 0–100% 比例。</p>}
 {total&&<p className="sm:col-span-2 text-sm" role={total.paid<storeCost?"alert":"status"}>{total.paid<storeCost?"實收低於店家成本，請先核對優惠及成本設定；尚不能結帳。":`店家分配 NT$ ${storeCost.toLocaleString()} · 開發人所得 NT$ ${calculateCourseSaleAllocation(total.paid,storeCost).developerAmount.toLocaleString()}`}</p>}
 <label>付款方式<select name="paymentMethod" className="min-h-11 w-full rounded border p-2" value={method} onChange={e=>setMethod(e.target.value)} disabled={total?.paid===0}>{["CASH","BANK_TRANSFER","CARD","OTHER"].map(m=><option key={m} value={m}>{COURSE_PAYMENT_LABELS[m]}</option>)}</select></label>
 {total?.paid===0&&<input type="hidden" name="paymentMethod" value="OTHER"/>}
 {method==="BANK_TRANSFER"&&total?.paid!==0&&<label>轉帳帳號後四碼<input name="transferLastFour" className="min-h-11 w-full rounded border p-2" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required placeholder="例如 1234"/></label>}
 <p className="text-sm text-earth-500 sm:col-span-2">{total?.paid===0?"全額折抵仍保留購買與方案紀錄，不建立收款收入。":"確認後同時發放方案並記錄實收；信用卡／轉帳為付款登錄，不會自動扣款。"}{kind==="PERCENT"&&" 折抵 20% 表示原價減 20%；金額四捨五入至元。"}</p>
 </fieldset>;
}
