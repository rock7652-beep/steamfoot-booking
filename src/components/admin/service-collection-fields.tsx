"use client";
import {useEffect,useState,type ReactNode} from 'react';
import {CourseDiscountFields} from './course-discount-fields';
import {calculateCourseCheckout} from '@/lib/course-checkout';
import type {ServiceCharge} from '@/server/beauty/service-charges';
const field='min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white p-2 text-base';
export type ServiceCollectionValue={id:string;amount:number;valid:boolean;discount:{kind:'AMOUNT'|'PERCENT';value:number}};
/** Data source independent service balance mode using the existing checkout discount fields. */
export function ServiceCollectionFields({charge,canDiscount,onValue,compact=false,paymentControl}:{compact?:boolean;paymentControl?:ReactNode;charge:ServiceCharge;canDiscount:boolean;onValue:(value:ServiceCollectionValue)=>void}){
 const [offer,setOffer]=useState<'NONE'|'AMOUNT'|'RATE'>(charge.discount.value===0?'NONE':charge.discount.kind==='PERCENT'?'RATE':'AMOUNT');
 const [value,setValue]=useState(charge.discount.kind==='PERCENT'?String((100-charge.discount.value)/10):String(charge.discount.value));
 const [manual,setManual]=useState('');
 const kind=offer==='RATE'?'PERCENT':'AMOUNT',discountValue=offer==='NONE'?0:offer==='RATE'?Math.round((100-Number(value)*10)*100)/100:Number(value);
 let total:ReturnType<typeof calculateCourseCheckout>|null=null;
 try{if(offer==='NONE'||value!==''&&(offer!=='RATE'||Number(value)>0))total=calculateCourseCheckout(charge.price,kind,discountValue);}catch{}
 const remaining=total?total.paid-charge.collected:null,amount=remaining===0?0:manual===''?remaining??NaN:Number(manual);
 const valid=remaining!==null&&remaining>=0&&Number.isSafeInteger(amount)&&amount>=0&&amount<=remaining&&(remaining===0||amount>0);
 useEffect(()=>onValue({id:charge.id,amount,valid,discount:{kind,value:discountValue}}),[charge.id,amount,valid,kind,discountValue,onValue]);
 return <section className="space-y-2 border-b border-earth-100 pb-3" aria-label={`${charge.personName}收款`}>
  <p className="font-medium">{charge.personName} · {charge.serviceName}</p>
  <CourseDiscountFields compact={compact} price={charge.price} canDiscount={canDiscount} offer={offer} value={value} onOfferChange={setOffer} onValueChange={setValue} total={total} totalLabel="應收"/>
  <dl className="flex flex-wrap justify-between gap-2 text-sm"><div>已收款 NT$ {charge.collected.toLocaleString()}</div><div>未收 NT$ {remaining===null?'—':remaining.toLocaleString()}</div></dl>
  {!canDiscount&&charge.reduction>0&&<p className="text-sm text-earth-600">已套用原優惠 NT$ {charge.reduction.toLocaleString()}</p>}
  {remaining===0?<p role="status" className="text-primary-800">{total?.paid===0?total.discount>0?'全額折抵，免收款':'本次免收款':'本次無待收款金額'}</p>:<div className={compact?"grid grid-cols-1 items-end gap-3 sm:grid-cols-2":"contents"}><label className="block">本次收款<input aria-label={`本次收款 ${charge.personName}`} type="number" min={remaining===0?0:1} max={Math.max(0,remaining??0)} step="1" required className={field} value={manual===''?remaining??'':manual} onChange={e=>setManual(e.target.value)}/></label>{paymentControl}</div>}
  {!valid&&<p role="alert" className="text-sm text-red-700">請核對優惠及本次收款，不得低於已收款或超過未收餘額。</p>}
 </section>;
}
