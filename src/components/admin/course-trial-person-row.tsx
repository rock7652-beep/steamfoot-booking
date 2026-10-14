"use client";
import {useEffect,useState,useTransition} from "react";
import {collectCourseTrial,supplementCourseTrialCustomer,voidCourseTrialPayment} from "@/server/actions/course-trial";
import {useCourseDraftGuard} from "@/components/admin/use-course-draft-guard";
export type TrialPerson={id:string;customerId:string|null;customerName:string;customerPhone:string;status:string;trialPrice:number|null;trialPayments:{id:string;amount:number;status:string;paymentMethod:string}[]};
export type TrialPersonSettings={trialAllowPriceEdit:boolean;trialDefaultPrice:number;trialMinPrice:number;trialMaxPrice:number};
const field="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-base";
const button="min-h-11 rounded-lg px-3 text-sm text-primary-700 disabled:opacity-50";
export function CourseTrialPersonRow({person,settings,canCollect,canCorrect,canSupplement,onUpdated,onGuard,showName=true}:{person:TrialPerson;settings:TrialPersonSettings;canCollect:boolean;canCorrect:boolean;canSupplement:boolean;onUpdated:()=>Promise<void>|void;onGuard?:(pending:boolean,dirty:boolean)=>void;showName?:boolean}){
 const [mode,setMode]=useState<"closed"|"info"|"pay"|"correct"|"void">("closed");
 const [name,setName]=useState(person.customerId?person.customerName:"");const [phone,setPhone]=useState(person.customerPhone);
 const [amount,setAmount]=useState<number|string>(person.trialPrice??settings.trialDefaultPrice);const [method,setMethod]=useState("CASH");const [reason,setReason]=useState("");
 const [error,setError]=useState("");const [dirty,setDirty]=useState(false);const [pending,start]=useTransition();const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 const [savedPerson,setSavedPerson]=useState<{name:string;phone:string;id:string}|null>(null);const [savedPayment,setSavedPayment]=useState<TrialPerson["trialPayments"][number]|null>(null);
 const serverVersion=`${person.customerId??""}:${person.trialPayments.find(p=>p.status==="SUCCESS")?.id??""}`;const [seenVersion,setSeenVersion]=useState(serverVersion);
 if(serverVersion!==seenVersion){setSeenVersion(serverVersion);setSavedPerson(null);setSavedPayment(null);}
 const receipt=person.trialPayments.find(p=>p.status==="SUCCESS")??savedPayment;
 const complete=!!person.customerId||!!savedPerson;const displayName=savedPerson?.name??person.customerName;
 const displayPhone=savedPerson?.phone??person.customerPhone;
 useCourseDraftGuard(dirty,pending);
 useEffect(()=>{onGuard?.(pending,dirty);return()=>onGuard?.(false,false);},[pending,dirty,onGuard]);
 async function run(action:()=>Promise<{success:boolean;error?:string;receipt?:TrialPerson["trialPayments"][number];customer?:{id:string;name:string;phone:string}}>){
  if(pending)return;
  start(async()=>{setError("");try{const r=await action();if(!r.success){setError(r.error??"儲存失敗");return;}
   if(r.customer)setSavedPerson({id:r.customer.id,name:r.customer.name,phone:r.customer.phone});if(r.receipt)setSavedPayment(r.receipt);
   setDirty(false);setMode("closed");setRequestKey(crypto.randomUUID());await onUpdated();
  }catch{setError("尚未確認儲存結果，資料保留，請核對後重試");}});
 }
 function open(next:typeof mode){if(pending)return;if(dirty&&!window.confirm("放棄未儲存修改？"))return;setDirty(false);setError("");setMode(next);if(next==="correct"){setAmount(receipt?.amount??0);setMethod(receipt?.paymentMethod??"CASH");}if(next==="pay")setAmount(person.trialPrice??settings.trialDefaultPrice);}
 return <section aria-label={`${displayName}體驗結帳`} className="w-full min-w-0 space-y-2 text-sm">
  <div className="flex min-h-11 flex-wrap items-center gap-x-2">
   {showName&&<strong className="min-w-0 break-words">{displayName}{displayPhone?` · ${displayPhone.slice(-3)}`:""}</strong>}
   {!complete&&<span className="text-earth-500">待補資料</span>}
   <span>{receipt?`已結帳 · $${receipt.amount}`:`$${person.trialPrice??settings.trialDefaultPrice} · 未結帳`}</span>
   {!complete&&canSupplement&&person.status!=="CANCELLED"&&<button type="button" disabled={pending} className={button} onClick={()=>open(mode==="info"?"closed":"info")}>補資料</button>}
   {!receipt&&canCollect&&person.status!=="CANCELLED"&&<button type="button" disabled={pending} className={button} onClick={()=>open(mode==="pay"?"closed":"pay")}>結帳</button>}
   {receipt&&canCorrect&&<button type="button" disabled={pending} className={button} onClick={()=>open(person.status==="RESERVED"?"correct":"void")}>更正</button>}
  </div>
  {mode==="info"&&<div className="grid grid-cols-2 gap-2 rounded-lg bg-earth-50 p-3">
   <label>姓名<input aria-label={`${displayName}姓名`} className={field} value={name} disabled={pending} onChange={e=>{setName(e.target.value);setDirty(true);}}/></label>
   <label>手機<input aria-label={`${displayName}手機`} className={field} type="tel" value={phone} disabled={pending} onChange={e=>{setPhone(e.target.value);setDirty(true);}}/></label>
   <button type="button" className={`${button} col-span-2 justify-self-end`} disabled={pending||!name.trim()||!phone.trim()} onClick={()=>void run(()=>supplementCourseTrialCustomer({bookingId:person.id,name,phone}))}>{pending?"儲存中…":"儲存資料"}</button>
  </div>}
  {(mode==="pay"||mode==="correct"||mode==="void")&&<div className="grid grid-cols-2 gap-2 rounded-lg bg-earth-50 p-3">
   {mode!=="void"&&<><label>金額<input aria-label={`${displayName}結帳金額`} className={field} type="number" min="0" max={settings.trialMaxPrice} value={amount} readOnly={!settings.trialAllowPriceEdit} disabled={pending} onChange={e=>{setAmount(e.target.value);setDirty(true);}}/></label>
   {Number(amount)>0&&<label>付款方式<select aria-label={`${displayName}付款方式`} className={field} value={method} disabled={pending} onChange={e=>{setMethod(e.target.value);setDirty(true);}}><option value="CASH">現金</option><option value="TRANSFER">轉帳</option><option value="LINE_PAY">LINE Pay</option><option value="CREDIT_CARD">信用卡</option><option value="OTHER">其他</option></select></label>}</>}
   {mode!=="pay"&&<label className="col-span-2">更正原因<input aria-label={`${displayName}更正原因`} className={field} value={reason} disabled={pending} onChange={e=>{setReason(e.target.value);setDirty(true);}}/></label>}
   {mode==="void"&&<p className="col-span-2">作廢結帳紀錄，實際退款另行處理。</p>}
   <div className="col-span-2 flex flex-wrap justify-end gap-2">
    {mode==="correct"&&<button type="button" disabled={pending} className={button} onClick={()=>open("void")}>作廢原結帳</button>}
    <button type="button" disabled={pending} className={button} onClick={()=>open("closed")}>取消</button>
    <button type="button" className={button} disabled={pending||amount===""||!Number.isInteger(Number(amount))||Number(amount)<0||(mode!=="pay"&&!reason.trim())} onClick={()=>void run(async()=>{
      if(mode==="void"){if(!receipt)return {success:false,error:"請重新核對原結帳"};if(!window.confirm(`作廢${displayName}的 $${receipt.amount} 結帳紀錄？其他人與出席狀態不變。`))return {success:false};return voidCourseTrialPayment({paymentId:receipt.id,reason});}
      return collectCourseTrial({bookingId:person.id,amount:Number(amount),paymentMethod:Number(amount)===0?undefined:method as "CASH",requestKey,...(mode==="correct"?{originalPaymentId:receipt?.id,reason}:{})});
    })}>{pending?"處理中…":mode==="void"?"確認作廢":mode==="correct"?"儲存更正":Number(amount)===0?"確認0元結帳":"確認結帳"}</button>
   </div>
  </div>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
 </section>;
}
