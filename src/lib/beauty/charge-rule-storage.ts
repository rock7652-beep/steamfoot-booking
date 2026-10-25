import {z} from 'zod';
import {key} from './contracts';
import {chargeTechnicianRule,prepareSelectedChargeRule,type QualifiedChargeTechnician} from './charge-technician-rule';
const ids=z.array(key).min(1).max(200).refine(value=>new Set(value).size===value.length,'服務不可重複');
const ownerSchema=z.object({storeId:key,chargeId:key,revision:z.number().int().nonnegative(),serviceIds:ids}).strict();
export type ChargeRuleOwner=z.infer<typeof ownerSchema>;
export const storedChargeRule=z.object({version:z.literal(1),rule:chargeTechnicianRule}).strict();
const sameIds=(a:string[],b:string[])=>a.length===b.length&&[...a].sort().every((id,i)=>id===[...b].sort()[i]);
/** Only an explicit database NULL on an authenticated legacy row permits compatibility fallback. */
export function readStoredChargeRule(value:unknown,source:ChargeRuleOwner,expectedStoreId:string,kind:'catalog'|'snapshot'){
 const owner=ownerSchema.parse(source);
 if(owner.storeId!==expectedStoreId)throw Error('無權讀取其他門市的收費規則');
 if(value===null)return chargeTechnicianRule.parse({...owner,mode:'LEGACY_UNRESTRICTED'});
 const {rule}=storedChargeRule.parse(value);
 if(rule.storeId!==owner.storeId||rule.chargeId!==owner.chargeId||!sameIds(rule.serviceIds,owner.serviceIds))throw Error('收費規則與資料來源不符');
 if(kind==='catalog'&&rule.revision!==owner.revision)throw Error('收費規則版本不符');
 return rule;
}
/** A card reader has no current-plan argument: historical cards cannot silently inherit new restrictions. */
export function readPurchasedChargeRule(value:unknown,card:ChargeRuleOwner,expectedStoreId:string){
 return readStoredChargeRule(value,card,expectedStoreId,'snapshot');
}
export function snapshotStoredChargeRule(value:unknown,source:ChargeRuleOwner,expectedStoreId:string,kind:'catalog'|'snapshot'){
 return storedChargeRule.parse({version:1,rule:readStoredChargeRule(value,source,expectedStoreId,kind)});
}
/** A patch only; no database client, service qualification writes or mutation of caller-owned rows. */
export function prepareStoredChargeRuleUpdate(input:unknown,source:ChargeRuleOwner,expectedStoreId:string,technicians:QualifiedChargeTechnician[]){
 const owner=ownerSchema.parse(source);
 if(owner.storeId!==expectedStoreId)throw Error('無權修改其他門市的收費規則');
 const selected=prepareSelectedChargeRule(input,{storeId:expectedStoreId,chargeId:owner.chargeId,expectedRevision:owner.revision,technicians});
 if(!sameIds(selected.serviceIds,owner.serviceIds))throw Error('不可在更新技師限制時變更方案適用服務');
 const revision=owner.revision+1;
 return {revision,chargeTechnicianRule:storedChargeRule.parse({version:1,rule:{...selected,revision}})};
}
export function singleChargeDisplayName(value:unknown,serviceName:string){
 return value===null?z.string().min(1).parse(serviceName):z.string().trim().min(1).max(100).parse(value);
}
export function singleChargePriceState(value:unknown){
 const configured=z.boolean().nullable().parse(value);
 return configured===null?'legacy-review':configured?'configured':'unconfigured';
}
