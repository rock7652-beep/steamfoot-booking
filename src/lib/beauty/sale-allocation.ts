import {calculateCourseSaleAllocation,courseAllocationAfterRefund} from '@/lib/course-sale-allocation';
/** Freeze the actual allocation at collection; an unset cost must never mean zero. */
export function beautySaleAllocation(paid:number,storeCost:number|null|undefined){
 if(storeCost==null)return null;
 return calculateCourseSaleAllocation(paid,storeCost);
}
export {courseAllocationAfterRefund as beautyAllocationAfterRefund};

/** A zero trial fee is explicit; only null/omission inherits the general fee. */
export function beautyServiceStoreCost(setting:{storeCost:number|null;trialStoreCost?:number|null}|undefined,isTrial:boolean){
 return (isTrial?setting?.trialStoreCost??setting?.storeCost:setting?.storeCost)??null;
}
