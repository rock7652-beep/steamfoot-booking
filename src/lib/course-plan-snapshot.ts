/** Only editable fields participate; no customer or transaction data. */
export function coursePlanSnapshot(plan: {name:string;points:number;price:number;storeCost?:number;validDays:number;isActive:boolean;unit:string;templateIds:string[];termSessionIds?:string[];customerPurchasable?:boolean;allowShared?:boolean}) {
  return {name:plan.name,points:plan.points,price:plan.price,storeCost:plan.storeCost??0,validDays:plan.validDays,isActive:plan.isActive,unit:plan.unit,templateIds:plan.templateIds,termSessionIds:plan.termSessionIds??[],customerPurchasable:plan.customerPurchasable??true,allowShared:plan.allowShared??false};
}
