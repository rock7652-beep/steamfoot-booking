/** Existing groups can hold companions; only repeated, identified recipients are service journeys. */
export function beautyJourneySegment<T extends {id:string;groupId:string;customerId?:string|null;startsAt:string}>(items:T[],item:T){
 if(!item.customerId)return null;
 const rows=items.filter(r=>r.groupId===item.groupId&&r.customerId===item.customerId).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.id.localeCompare(b.id));
 return rows.length>1?{index:rows.findIndex(r=>r.id===item.id)+1,total:rows.length}:null;
}
