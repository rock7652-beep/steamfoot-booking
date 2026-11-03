/** Split a receipt across the same FIFO period boundaries used by tuition totals.
 * Keep each receipt's actual date/method; never infer a payment from a purchase date.
 */
export function musicPeriodReceipts<T extends {id:string;amount:number;paidAt:string}>(due:number[], receipts:T[]) {
 const result=due.map(()=>[] as Array<T & {allocated:number}>);
 let cursor=0,filled=0;
 for(const receipt of [...receipts].sort((a,b)=>a.paidAt.localeCompare(b.paidAt)||a.id.localeCompare(b.id))){
  let left=receipt.amount;
  while(left>0 && cursor<due.length){
   const room=due[cursor]-filled;
   if(room<=0){cursor++;filled=0;continue;}
   const allocated=Math.min(left,room);result[cursor].push({...receipt,allocated});left-=allocated;filled+=allocated;
  }
 }
 return result;
}
