import 'server-only';
import {z} from 'zod';
import {key} from '@/lib/beauty/contracts';
import {prepareStoredChargeRuleUpdate,type ChargeRuleOwner} from '@/lib/beauty/charge-rule-storage';
import {chargeTechnicianRule,type QualifiedChargeTechnician} from '@/lib/beauty/charge-technician-rule';
/** Dependency boundary for a future authenticated transaction adapter; no real adapter is registered. */
export type ChargeRuleTransaction={
 command:<T>(requestKey:string,payload:unknown,work:()=>Promise<T>)=>Promise<T>;
 readChargeForUpdate:(chargeId:string)=>Promise<ChargeRuleOwner|null>;
 readTechnicians:()=>Promise<QualifiedChargeTechnician[]>;
 writeRule:(chargeId:string,expectedRevision:number,patch:ReturnType<typeof prepareStoredChargeRuleUpdate>)=>Promise<boolean>;
};
export type ChargeRuleSavePort={authorize:()=>Promise<{storeId:string}>;transaction:<T>(storeId:string,work:(tx:ChargeRuleTransaction)=>Promise<T>)=>Promise<T>};
const request=z.object({expectedStoreId:key,chargeId:key,requestKey:z.string().uuid(),rule:chargeTechnicianRule}).strict();
/** Authorization must verify plans.edit, store feature and operating state before returning its store. */
export function createChargeRuleSave(port:ChargeRuleSavePort){
 return async(input:unknown)=>{
  const actor=await port.authorize(),data=request.parse(input);
  if(actor.storeId!==data.expectedStoreId)throw Error('門市已切換，請重新開啟');
  return port.transaction(actor.storeId,tx=>tx.command(data.requestKey,data,async()=>{
   const row=await tx.readChargeForUpdate(data.chargeId);
   if(!row||row.chargeId!==data.chargeId||row.storeId!==actor.storeId)throw Error('找不到收費方式');
   const patch=prepareStoredChargeRuleUpdate(data.rule,row,actor.storeId,await tx.readTechnicians());
   if(!await tx.writeRule(data.chargeId,row.revision,patch))throw Error('收費方式已更新，請重新核對');
   return patch;
  }));
 };
}
