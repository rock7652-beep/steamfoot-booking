import type {SportsSnapshot} from "./sports-staging-types";
/** Calendar metadata may paint the form while the scoped options reader runs.
 * No purchased cards, prices or balances are used to authorize submission.
 */
export function sportsSchedulePreview(storeId:string,date:string,templates:{id:string;name:string;isActive:boolean;musicSubject?:{id:string;name:string;isActive:boolean}|null;durationMinutes:number}[],coaches:{id:string;displayName:string;status:string;courseCoachEnabled:boolean;courseQualifiedTemplateIds:string[]}[],rooms:{id:string;name:string;isActive:boolean;capacity:number|null;rentalEnabled?:boolean}[]):SportsSnapshot {
 return {storeId,date,fees:[],students:[],lessons:[],customers:[],
  subjects:templates.filter(t=>t.isActive&&t.id.startsWith("sports_item_")&&t.musicSubject?.isActive).map(t=>({id:t.musicSubject!.id,name:t.musicSubject!.name,category:"",active:true,updatedAt:"",templateId:t.id,durationMinutes:t.durationMinutes})),
  coaches:coaches.filter(c=>c.status==="ACTIVE"&&c.courseCoachEnabled).map(c=>({id:c.id,name:c.displayName,templates:c.courseQualifiedTemplateIds})),
  rooms:rooms.filter(r=>r.isActive).map(r=>({id:r.id,name:r.name,capacity:r.capacity,rental:!!r.rentalEnabled})),
 };
}
