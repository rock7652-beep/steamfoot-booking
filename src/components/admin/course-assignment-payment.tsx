"use client";
import { useEffect, useState } from "react";
import { calculateCourseSaleAllocation } from "@/lib/course-sale-allocation";
import { calculateCourseCheckout, COURSE_PAYMENT_LABELS } from "@/lib/course-checkout";
export type AssignmentSummary = { paid: number | null; valid: boolean };
export function CourseAssignmentPayment({profitEnabled=true,price,canDiscount,storeCost=0,showAllocation=false,onSummary}:{
  profitEnabled?:boolean;price:number;canDiscount:boolean;storeCost?:number;showAllocation?:boolean;onSummary?:(summary:AssignmentSummary)=>void;
}) {
  const [offer,setOffer]=useState<"NONE"|"AMOUNT"|"RATE">("NONE"),[value,setValue]=useState(""),[method,setMethod]=useState(""),[lastFour,setLastFour]=useState("");
  const kind=offer==="RATE"&&canDiscount?"PERCENT":"AMOUNT";
  const discountValue=!canDiscount||offer==="NONE"?0:offer==="RATE"?Math.round((100-Number(value)*10)*100)/100:Number(value);
  let total:ReturnType<typeof calculateCourseCheckout>|null=null;
  try {if(!canDiscount||offer==="NONE"||(value!==""&&(offer!=="RATE"||Number(value)>0)))total=calculateCourseCheckout(price,kind,discountValue);}catch{}
  const paid=total?.paid??null;
  const valid=paid!==null&&(!profitEnabled||paid>=storeCost)&&(paid===0||(!!method&&(method!=="BANK_TRANSFER"||/^\d{4}$/.test(lastFour))));
  useEffect(()=>{onSummary?.({paid,valid});},[paid,valid,onSummary]);
  const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white p-2 text-base";
  return <section className="min-w-0 space-y-3" aria-labelledby="assignment-payment-title">
    <h3 id="assignment-payment-title" className="font-semibold">結帳資料</h3>
    <input type="hidden" name="expectedStoreCost" value={storeCost}/><input type="hidden" name="expectedListPrice" value={price}/>
    <input type="hidden" name="discountKind" value={kind}/><input type="hidden" name="discountValue" value={discountValue}/>
    {canDiscount&&<label className="block">優惠方式<select className={field} value={offer} onChange={e=>{const next=e.target.value as typeof offer;setOffer(next);setValue(next==="RATE"?"9":"");}}><option value="NONE">無優惠</option><option value="AMOUNT">折抵金額</option><option value="RATE">打折</option></select></label>}
    {canDiscount&&offer!=="NONE"&&<label className="block">{offer==="RATE"?"打幾折（9 代表九折）":"折抵多少元"}<input aria-label="優惠數值" className={field} type="number" inputMode="decimal" min={offer==="RATE"?"0.01":"0"} max={offer==="RATE"?"10":price} step={offer==="RATE"?"0.01":"1"} value={value} onChange={e=>setValue(e.target.value)} required/></label>}
    <dl className="space-y-2 rounded-lg bg-primary-50 p-3" aria-live="polite">
      <div className="flex justify-between gap-3"><dt>原價</dt><dd>NT$ {price.toLocaleString()}</dd></div>
      <div className="flex justify-between gap-3"><dt>折抵</dt><dd>{total?"− NT$ "+total.discount.toLocaleString():"—"}</dd></div>
      <div className="flex justify-between gap-3 border-t border-primary-200 pt-2 font-semibold"><dt>實收</dt><dd>{paid!==null?"NT$ "+paid.toLocaleString():"—"}</dd></div>
    </dl>
    {!total&&<p role="alert" className="text-sm text-red-700">請輸入有效優惠；打折填 0.01–10，折抵金額不得超過售價。</p>}
    {profitEnabled&&paid!==null&&paid<storeCost&&<p role="alert" className="text-sm text-red-700">實收低於店家成本，請核對優惠；尚不能結帳。</p>}
    {showAllocation&&paid!==null&&(!profitEnabled||paid>=storeCost)&&<p className="text-sm text-earth-600">店家成本 NT$ {storeCost.toLocaleString()} · 開發人所得 NT$ {calculateCourseSaleAllocation(paid,storeCost).developerAmount.toLocaleString()}</p>}
    {paid===0?<><input type="hidden" name="paymentMethod" value="OTHER"/><p className="text-sm text-earth-600">全額折抵：保留購買與方案紀錄，不建立收款收入。</p></>:<>
      <label className="block">已收款方式<select name="paymentMethod" className={field} value={method} onChange={e=>setMethod(e.target.value)} required><option value="">請選擇已收款方式</option>{["CASH","BANK_TRANSFER","CARD","OTHER"].map(m=><option key={m} value={m}>{COURSE_PAYMENT_LABELS[m]}</option>)}</select></label>
      {method==="BANK_TRANSFER"&&<label className="block">轉帳帳號後四碼<input name="transferLastFour" className={field} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required placeholder="例如 1234" value={lastFour} onChange={e=>setLastFour(e.target.value)}/></label>}
      <p className="text-sm text-earth-500">請核對已收款再確認；此處只登錄，不會自動扣款。</p>
    </>}
  </section>;
}
