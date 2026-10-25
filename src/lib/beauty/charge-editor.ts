import {z} from 'zod';
import {key,money} from './contracts';
const shared={
 storeCost:money.nullable().optional(),expectedStoreId:key,serviceId:key,name:z.string().trim().min(1,'請填寫收費名稱').max(100),price:money,
 technicianIds:z.array(key).min(1,'請至少選一位可安排技師').max(200).refine(ids=>new Set(ids).size===ids.length,'技師不可重複'),
};
/** A multiple-session charge has no trial fields; reject rather than silently save them. */
export const beautyChargeDraft=z.discriminatedUnion('kind',[
 z.object({...shared,kind:z.literal('single'),sessions:z.literal(1),trialPrice:money.nullable(),trialMinutes:z.number().int().min(5).max(720).nullable()}).strict(),
 z.object({...shared,kind:z.literal('plan'),sessions:z.number().int().min(2).max(10000),validDays:z.number().int().min(1).max(3650),allowShared:z.boolean()}).strict(),
]);
export type BeautyChargeDraft=z.infer<typeof beautyChargeDraft>;
export type ChargeService={id:string;name:string;active:boolean;duration:number;buffer:number};
export type ChargeTechnician={id:string;name:string;active:boolean;serviceIds:string[]};
export function validateBeautyCharge(input:unknown,storeId:string,services:ChargeService[],technicians:ChargeTechnician[]){
 const draft=beautyChargeDraft.parse(input);
 if(draft.storeCost!=null&&draft.storeCost>draft.price)throw Error('店家固定費用不可超過售價');
 if(draft.expectedStoreId!==storeId)throw Error('門市已切換，請重新開啟');
 const service=services.find(s=>s.id===draft.serviceId&&s.active);
 if(!service)throw Error('請選擇本店啟用的服務');
 if(draft.technicianIds.some(id=>!technicians.some(t=>t.id===id&&t.active&&t.serviceIds.includes(service.id))))throw Error('所選技師未啟用或不具此服務資格');
 return {draft,service,duration:service.duration,buffer:service.buffer,amount:draft.price,
  trial:draft.kind==='single'&&draft.trialPrice!==null?{price:draft.trialPrice,duration:draft.trialMinutes??service.duration}:null};
}
/** Missing backend capability must never mutate global service qualification instead. */
export function assertChargePersistence(capabilities:{perChargeTechnicians:boolean}){
 if(!capabilities.perChargeTechnicians)throw Error('方案專屬技師限制尚未接通，設定未儲存');
}
