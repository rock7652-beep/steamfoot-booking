/** Shared mechanics only. Adapters retain each module's eligibility and units. */
export function purchaseOrder<T extends {id:string;createdAt:Date}>(cards:T[],purchases:Array<{cardId:string|null;createdAt:Date}>):T[]{
 const dates=new Map<string,number>();
 for(const purchase of purchases){if(!purchase.cardId)continue;const time=purchase.createdAt.getTime();dates.set(purchase.cardId,Math.min(dates.get(purchase.cardId)??Infinity,time));}
 return [...cards].sort((a,b)=>(dates.get(a.id)??a.createdAt.getTime())-(dates.get(b.id)??b.createdAt.getTime())||a.id.localeCompare(b.id));
}
export type ItemBalance={remaining:number;available:number;cost:number;unit:string;planName:string};
/** A shared card appears once for a member. Mixed units must be presented separately. */
export function sumItemBalances(rows:Array<ItemBalance&{id:string}>):ItemBalance[]{
 const units=new Map<string,ItemBalance>();
 const seen=new Set<string>();
 for(const row of rows){if(seen.has(row.id))continue;seen.add(row.id);const previous=units.get(row.unit);
  if(previous){previous.remaining+=Math.max(0,row.remaining);previous.available+=Math.max(0,row.available);previous.cost=Math.min(previous.cost,row.cost);}
  else units.set(row.unit,{remaining:Math.max(0,row.remaining),available:Math.max(0,row.available),cost:row.cost,unit:row.unit,planName:'同項目方案合計'});
 }
 return [...units.values()];
}
