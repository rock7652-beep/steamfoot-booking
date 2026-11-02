import {addOnSnapshots,addOnTotals} from './add-ons';
/** Allocate receipts to base service first. Add-ons never enlarge phase-one commission. */
export function baseServiceCollected(basePrice:number,collected:number,items:unknown){
 const extras=addOnTotals(addOnSnapshots.parse(items??[])).price;
 return extras===0?collected:Math.min(basePrice,Math.max(0,collected));
}
