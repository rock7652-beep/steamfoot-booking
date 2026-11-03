import {addOnGroups,addOnTotals,resolveAddOns} from './add-ons';
import {serviceDuration} from './service-duration';
import {journeyIssue,type AdditionalService} from './service-journey';
import type {Service} from './allocation';
export type JourneyPerson={serviceId:string;cardId?:string|null;isTrial?:boolean;pendingIdentity?:boolean;specifiedTechnicianId:string|null;specifiedLocationId?:string|null;addOnIds?:string[];additionalServices?:AdditionalService[];separateTechnicians?:boolean};
export function expandServiceJourney<T extends JourneyPerson>(people:T[],services:Service[],strict=true):Array<Omit<T,'additionalServices'|'isTrial'|'specifiedTechnicianId'> & {additionalServices?:undefined;isTrial?:boolean;specifiedTechnicianId:string|null;journeyPersonIndex:number;journeySegmentIndex:number;startOffsetMinutes:number;technicianGroup?:string}>{
 return people.flatMap((person,personIndex)=>{
  const issue=journeyIssue(person);if(strict&&issue)throw new Error(issue);
  if(!person.additionalServices?.length)return [{...person,additionalServices:undefined,journeyPersonIndex:personIndex,journeySegmentIndex:0,startOffsetMinutes:0}];
  let offset=0;
  return [person,...(person.additionalServices??[])].map((segment,segmentIndex)=>{
   const service=services.find(s=>s.id===segment.serviceId&&s.active);if(!service)throw new Error('服務項目已停用，請重新選擇');
   const row={...person,...segment,addOnIds:segmentIndex===0?person.addOnIds:segment.addOnIds??[],additionalServices:undefined,journeyPersonIndex:personIndex,journeySegmentIndex:segmentIndex,startOffsetMinutes:offset,
    ...(person.additionalServices?.length&&!person.separateTechnicians?{technicianGroup:`person-${personIndex}`,specifiedTechnicianId:person.specifiedTechnicianId}:{}),
    ...(segmentIndex>0?{isTrial:false}:{}),
   };
   offset+=serviceDuration(service,row.isTrial)+addOnTotals(strict?resolveAddOns(service.addOnGroups,row.addOnIds):(addOnGroups.safeParse(service.addOnGroups??[]).data??[]).flatMap(g=>g.options).filter(o=>row.addOnIds?.includes(o.id)).map(o=>({...o,groupId:'',groupTitle:'',quantity:1 as const}))).duration+service.buffer;
   return row;
  });
 });
}
