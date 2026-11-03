import {dayRange,toLocalDateStr} from "./date-utils";

/** Receipts are whole NT dollars; an empty amount means full settlement. */
export function musicReceiptAmount(due:number,amount?:number) {
 const received=amount??due;
 if(!Number.isSafeInteger(due)||due<0||!Number.isSafeInteger(received)||received<0||received>due)throw new Error("本次實收須為整數，且不得超過未收金額");
 return received;
}
export function musicPaymentDate(value=toLocalDateStr()) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value>toLocalDateStr())throw new Error("付款日期須為有效日期，且不可晚於今天");
 return dayRange(value).start;
}
/** Allocate rounded totals by equal periods; the last period absorbs integer remainder. */
export function musicTuitionPeriods(sizes:number[],due:number,received:number) {
 if(!sizes.length||sizes.some(n=>!Number.isSafeInteger(n)||n<1))return [];
 musicReceiptAmount(due,received);
 const base=Math.floor(due/sizes.length);
 let left=received;
 return sizes.map((lessons,index)=>{const amount=index===sizes.length-1?due-base*index:base;const paid=Math.min(left,amount);left-=paid;return {period:index+1,lessons,due:amount,received:paid,outstanding:amount-paid};});
}
