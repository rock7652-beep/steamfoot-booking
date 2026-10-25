"use client";
import {calculateCourseSaleAllocation} from '@/lib/course-sale-allocation';

type PricingKey='price'|'trialPrice'|'storeCost'|'trialStoreCost';
const inputClass='min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base';
function money(value:string){if(value.trim()==='')return null;const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>=0&&parsed<=10000000?parsed:null;}

/** Monetary fields for the existing charge form; all persistence remains in its authorized writer. */
export function CourseChargePricingFields({kind,price,trialPrice,storeCost,trialStoreCost,sessions,onChange}:{kind:'single'|'plan';price:string;trialPrice:string;storeCost:string;trialStoreCost:string;sessions:string;onChange:(key:PricingKey,value:string)=>void}){
 const normalCost=money(storeCost),trialCost=trialStoreCost.trim()===''?normalCost:money(trialStoreCost);
 const preview=(label:string,amount:number|null,cost:number|null)=>{
  if(amount===null)return <p>{label}：填寫價格後試算。</p>;
  if(cost===null)return <p>{label}：未設定店家費用，暫不計算分潤。</p>;
  const result=calculateCourseSaleAllocation(amount,cost);
  return <p>{label}：店家 ${result.storeAmount.toLocaleString('zh-TW')}／所屬店長 ${result.developerAmount.toLocaleString('zh-TW')}{result.shortfall>0?'（價格低於店家費用）':''}</p>;
 };
 return <fieldset className="sm:col-span-2 min-w-0 space-y-3" aria-label="價格與分帳">
  <legend className="font-medium">價格與分帳</legend>
  <div className="grid min-w-0 gap-3 @min-[560px]:grid-cols-2">
   <label>售價 *<input aria-label="售價" className={inputClass} name="price" type="number" min="0" max="10000000" step="1" required value={price} onChange={e=>onChange('price',e.target.value)}/></label>
   {kind==='single'&&<label>體驗價格（元，選填）<input aria-label="體驗價格" className={inputClass} name="trialPrice" type="number" min="0" max="10000000" step="1" value={trialPrice} onChange={e=>onChange('trialPrice',e.target.value)}/><span className="text-sm text-earth-600">留白不提供體驗；填 0 為免費體驗。</span></label>}
   <label>店家固定費用（元，選填）<input aria-label="店家固定費用" className={inputClass} name="storeCost" type="number" min="0" max="10000000" step="1" value={storeCost} onChange={e=>onChange('storeCost',e.target.value)}/><span className="text-sm text-earth-600">留白不計算分潤；填 0 為店家不分配。</span></label>
   {kind==='single'&&<label>體驗店家費用（元，選填）<input aria-label="體驗店家費用" className={inputClass} name="trialStoreCost" type="number" min="0" max="10000000" step="1" placeholder="沿用一般費用" value={trialStoreCost} onChange={e=>onChange('trialStoreCost',e.target.value)}/><span className="text-sm text-earth-600">留白沿用一般費用；填 0 為店家不分配。</span></label>}
  </div>
  <div role="status" aria-live="polite" data-charge-allocation className="space-y-1 rounded-lg bg-primary-50 p-3 text-sm">
   {preview(kind==='single'?'一般服務':'方案',money(price),normalCost)}
   {kind==='single'&&trialPrice.trim()!==''&&preview('體驗',money(trialPrice),trialCost)}
   {kind==='plan'&&money(price)!==null&&Number(sessions)>0&&<p>單位價格 <strong>NT$ {Math.round(Number(price)/Number(sessions)).toLocaleString('zh-TW')}／次</strong></p>}
   <p className="text-earth-600">實收優先分配店家費用，其餘歸所屬店長。此處依售價試算，收款時依折扣後實收計算。</p>
  </div>
 </fieldset>;
}
