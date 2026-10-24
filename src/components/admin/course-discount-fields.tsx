"use client";
import type {calculateCourseCheckout} from "@/lib/course-checkout";
/** The same discount controls are used for plan checkout and service collection. */
export function CourseDiscountFields({price,canDiscount,offer,value,onOfferChange,onValueChange,total,totalLabel="實收",compact=false}:{compact?:boolean;price:number;canDiscount:boolean;offer:"NONE"|"AMOUNT"|"RATE";value:string;onOfferChange:(v:"NONE"|"AMOUNT"|"RATE")=>void;onValueChange:(v:string)=>void;total:ReturnType<typeof calculateCourseCheckout>|null;totalLabel?:string}){
 const field="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white p-2 text-base",paid=total?.paid??null;
 return <div className={compact?"flex min-w-0 flex-wrap items-end gap-2":"min-w-0 space-y-2"}>    {canDiscount&&<label className={compact?"inline-flex min-w-40 flex-1 items-center gap-2 whitespace-nowrap":"block"}>{compact?"優惠":"優惠方式"}<select aria-label="優惠方式" className={field} value={offer} onChange={e=>{const next=e.target.value as typeof offer;onOfferChange(next);onValueChange(next==="RATE"?"9":"");}}><option value="NONE">無優惠</option><option value="AMOUNT">折抵金額</option><option value="RATE">打折</option></select></label>}
    {canDiscount&&offer!=="NONE"&&<label className={compact?"inline-flex min-w-32 flex-1 items-center gap-2 whitespace-nowrap":"block"}>{offer==="RATE"?(compact?"折數":"打幾折（9 代表九折）"):(compact?"折抵":"折抵多少元")}<input aria-label="優惠數值" className={field} type="number" inputMode="decimal" min={offer==="RATE"?"0.01":"0"} max={offer==="RATE"?"10":price} step={offer==="RATE"?"0.01":"1"} value={value} onChange={e=>onValueChange(e.target.value)} required/></label>}
    <dl className={compact?"flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-primary-50 p-2 text-sm":"space-y-2 rounded-lg bg-primary-50 p-3"} aria-live="polite">
      <div className="flex justify-between gap-3"><dt>原價</dt><dd>NT$ {price.toLocaleString()}</dd></div>
      <div className="flex justify-between gap-3"><dt>折抵</dt><dd>{total?"− NT$ "+total.discount.toLocaleString():"—"}</dd></div>
      <div className={compact?"flex justify-between gap-3 font-semibold":"flex justify-between gap-3 border-t border-primary-200 pt-2 font-semibold"}><dt>{totalLabel}</dt><dd>{paid!==null?"NT$ "+paid.toLocaleString():"—"}</dd></div>
    </dl>
</div>;
}
