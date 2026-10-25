import {calculateCourseSaleAllocation,courseAllocationAfterRefund} from '@/lib/course-sale-allocation';
/** Freeze the actual allocation at collection; an unset cost must never mean zero. */
export function beautySaleAllocation(paid:number,storeCost:number|null|undefined){
 if(storeCost==null)return null;
 return calculateCourseSaleAllocation(paid,storeCost);
}
export {courseAllocationAfterRefund as beautyAllocationAfterRefund};

/** One wording/calculation for the list and the existing transaction detail panel. */
export function beautyAllocationSummary(row:{price:number;storeCostSnapshot:number|null;storeCostShortfall?:number;revenueStaffId:string|null;status:string;refunds:{amount:number}[]}){
 if(row.status==='VOIDED')return '已作廢';
 if(row.status==='PENDING')return '尚未收款';
 if(row.storeCostSnapshot==null)return '未設定（不回推舊交易）';
 try{
  const value=courseAllocationAfterRefund(row.price,row.storeCostSnapshot,row.refunds.reduce((n,r)=>n+r.amount,0));
  return `店家 $${value.storeAmount.toLocaleString()}／${row.revenueStaffId?'所屬店長':'未歸屬'} $${value.developerAmount.toLocaleString()}${row.storeCostShortfall?'（實收低於固定費用）':''}`;
 }catch{return '分潤紀錄待核對';}
}

/** A zero trial fee is explicit; only null/omission inherits the general fee. */
export function beautyServiceStoreCost(setting:{storeCost:number|null;trialStoreCost?:number|null}|undefined,isTrial:boolean){
 return (isTrial?setting?.trialStoreCost??setting?.storeCost:setting?.storeCost)??null;
}
