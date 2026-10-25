import {z} from 'zod';
import {key} from './contracts';
import {allocateParty,type Person} from './allocation';
const uniqueIds=z.array(key).max(200).refine(ids=>new Set(ids).size===ids.length,'不可包含重複 ID');
const scope={storeId:key,chargeId:key,revision:z.number().int().nonnegative(),serviceIds:uniqueIds.refine(ids=>ids.length>0,'缺少適用服務')};
/** Explicit legacy mode is required: missing/corrupt selected lists never mean unrestricted. */
export const chargeTechnicianRule=z.discriminatedUnion('mode',[
 z.object({...scope,mode:z.literal('LEGACY_UNRESTRICTED')}).strict(),
 z.object({...scope,mode:z.literal('SELECTED'),technicianIds:uniqueIds.refine(ids=>ids.length>0,'請至少選一位可安排技師')}).strict(),
]);
export type ChargeTechnicianRule=z.infer<typeof chargeTechnicianRule>;
export type QualifiedChargeTechnician={id:string;storeId:string;active:boolean;serviceIds:string[]};
/** Server preparation primitive only; callers must authenticate and load authoritative rows first. */
export function prepareSelectedChargeRule(input:unknown,context:{storeId:string;chargeId:string;expectedRevision:number;technicians:QualifiedChargeTechnician[]}){
 const rule=chargeTechnicianRule.parse(input);
 if(rule.storeId!==context.storeId||rule.chargeId!==context.chargeId)throw Error('收費方式不屬於本店或目標已變更');
 if(rule.revision!==context.expectedRevision)throw Error('收費方式已更新，請重新核對');
 if(rule.mode!=='SELECTED')throw Error('新設定必須明確勾選技師');
 if(rule.serviceIds.length!==1)throw Error('新收費方式請選擇一個服務項目');
 if(rule.technicianIds.some(id=>!context.technicians.some(t=>t.id===id&&t.storeId===context.storeId&&t.active&&t.serviceIds.includes(rule.serviceIds[0]))))throw Error('技師不屬於本店、未啟用或不具服務資格');
 return rule;
}
/** Deep validation/cloning prevents later catalog edits from mutating a purchased snapshot. */
export function purchaseChargeRuleSnapshot(input:unknown,storeId:string,chargeId:string){
 const rule=chargeTechnicianRule.parse(input);
 if(rule.storeId!==storeId||rule.chargeId!==chargeId)throw Error('無權使用此收費方式');
 return rule;
}
/** Do not accept a rule or allowed list supplied by the booking browser. */
export function resolveChargeTechnicians(input:unknown,storeId:string,serviceId:string):readonly string[]|undefined{
 const rule=chargeTechnicianRule.parse(input);
 if(rule.storeId!==storeId||!rule.serviceIds.includes(serviceId))throw Error('收費方式不適用此門市或服務');
 return rule.mode==='SELECTED'?[...rule.technicianIds]:undefined;
}
type AllocationInput=Parameters<typeof allocateParty>[0];
type ChargedPerson=Omit<Person,'allowedTechnicianIds'>&{chargeRule:unknown};
/** Same deterministic core for slot checks, booking and rescheduling; not wired to live actions yet. */
export function allocateChargedParty(input:Omit<AllocationInput,'people'>&{storeId:string;people:ChargedPerson[]}){
 const {storeId,people,...allocation}=input;
 return allocateParty({...allocation,people:people.map(({chargeRule,...person})=>({...person,allowedTechnicianIds:resolveChargeTechnicians(chargeRule,storeId,person.serviceId)}))});
}
