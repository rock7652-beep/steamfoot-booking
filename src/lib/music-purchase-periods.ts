/** Display numbering only. Persisted lesson/receipt periods stay local to their card. */
export type MusicPeriodBatch = { batch: number; start: number | null; end: number | null };
type PurchaseCard = {id:string;planId:string;templateIds:readonly string[];musicTermSizes:readonly number[];createdAt:Date|string};
export function musicPurchasePeriods(cards:readonly PurchaseCard[]) {
 const result=new Map<string,MusicPeriodBatch>();
 const groups=new Map<string,{batch:number;next:number|null}>();
 for(const card of [...cards].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()||a.id.localeCompare(b.id))){
  const key=JSON.stringify([card.planId,[...new Set(card.templateIds)].sort()]);
  const group=groups.get(key)??{batch:0,next:1};
  const known=card.musicTermSizes.length>0&&card.musicTermSizes.every(n=>Number.isSafeInteger(n)&&n>0);
  const start=known?group.next:null;
  const end=start===null?null:start+card.musicTermSizes.length-1;
  result.set(card.id,{batch:group.batch+1,start,end});
  groups.set(key,{batch:group.batch+1,next:end===null?null:end+1});
 }
 return result;
}
export function musicPeriodNumber(localPeriod:number,start?:number|null) {
 return start==null?localPeriod:start+localPeriod-1;
}
export function musicPeriodLabel(localPeriod:number,start?:number|null,batch?:number) {
 return `${batch&&start==null?"本筆第":"第"} ${musicPeriodNumber(localPeriod,start)} 期`;
}
export function musicBatchLabel(batch?:number,start?:number|null,count=0) {
 if(!batch)return "";
 const range=start==null?"期別待確認":count===1?`第 ${start} 期`:`第 ${start}–${start+count-1} 期`;
 return `第 ${batch} 次購課・${range}`;
}
