import {calculateCourseCheckout} from '@/lib/course-checkout';
/** Shared by collection and reminder reads; historical list prices are never rewritten. */
export function beautyServiceQuote(price:number,body:string|null){
 const d=body?JSON.parse(body):{kind:'AMOUNT',value:0,price};
 if(!['AMOUNT','PERCENT'].includes(d.kind)||typeof d.value!=='number'||d.price!==price)throw Error('優惠紀錄待核對');
 const discount:{kind:'AMOUNT'|'PERCENT';value:number}={kind:d.kind,value:d.value};
 const quote=calculateCourseCheckout(price,discount.kind,discount.value);
 return {discount,reduction:quote.discount,netPrice:quote.paid};
}
