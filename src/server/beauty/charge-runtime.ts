import 'server-only';
import {AppError} from '@/lib/errors';
import {readStoredChargeRule,snapshotStoredChargeRule,storedChargeRule,type ChargeRuleOwner} from '@/lib/beauty/charge-rule-storage';
import {resolveChargeTechnicians} from '@/lib/beauty/charge-technician-rule';
import type {Prisma} from '../../../generated/beauty-client';
export type ChargeTx=Prisma.TransactionClient;
/** Both switches are required; configuration is deliberately unchanged by this implementation. */
export function beautyChargeRulesEnabled(storeId:string){return process.env.BEAUTY_CHARGE_RULES_ENABLED==='1'&&(process.env.BEAUTY_CHARGE_RULES_STORE_IDS??'').split(',').map(id=>id.trim()).includes(storeId);}
export function beautyChargeEditingEnabled(storeId:string){return beautyChargeRulesEnabled(storeId)&&process.env.BEAUTY_CHARGE_EDITING_ENABLED==='1';}
type CatalogRow={ruleIsNull?:boolean;id:string;revision:number;chargeTechnicianRule:unknown;singlePriceConfigured?:boolean|null;singleChargeName?:string|null;serviceIds?:string[]};
export async function readCatalogCharge(tx:ChargeTx,storeId:string,kind:'single'|'plan',id:string){
 const rows=kind==='single'?await tx.$queryRaw<CatalogRow[]>`SELECT id,revision,"chargeTechnicianRule","singlePriceConfigured","singleChargeName",("chargeTechnicianRule" IS NULL) AS "ruleIsNull" FROM "BeautyService" WHERE "storeId"=${storeId} AND id=${id}`:await tx.$queryRaw<CatalogRow[]>`SELECT id,revision,"chargeTechnicianRule","serviceIds",("chargeTechnicianRule" IS NULL) AS "ruleIsNull" FROM "BeautyPlan" WHERE "storeId"=${storeId} AND id=${id}`;
 const row=rows[0];if(!row)throw new AppError('NOT_FOUND','找不到收費方式');
 const owner:ChargeRuleOwner={storeId,chargeId:`${kind==='single'?'service':'plan'}:${id}`,revision:row.revision,serviceIds:kind==='single'?[id]:row.serviceIds!};
 try{return {row,owner,snapshot:snapshotStoredChargeRule(storedColumn(row.chargeTechnicianRule,row.ruleIsNull),owner,storeId,'catalog')};}catch{throw new AppError('CONFLICT','收費規則待核對，請聯絡店家');}
}
export async function readCardCharge(tx:ChargeTx,storeId:string,card:{id:string;planId:string;serviceIds:string[]}){
 const [row]=await tx.$queryRaw<{chargeRuleSnapshot:unknown;ruleIsNull?:boolean}[]>`SELECT "chargeRuleSnapshot",("chargeRuleSnapshot" IS NULL) AS "ruleIsNull" FROM "BeautyCard" WHERE "storeId"=${storeId} AND id=${card.id}`;
 if(!row)throw new AppError('NOT_FOUND','找不到方案快照');
 const owner={storeId,chargeId:`plan:${card.planId}`,revision:0,serviceIds:card.serviceIds};
 try{return snapshotStoredChargeRule(storedColumn(row.chargeRuleSnapshot,row.ruleIsNull),owner,storeId,'snapshot');}catch{throw new AppError('CONFLICT','購入方案規則待核對');}
}
export async function readAppointmentCharge(tx:ChargeTx,storeId:string,id:string){
 const item=await tx.beautyAppointment.findFirst({where:{id,storeId}});
 if(!item)throw new AppError('NOT_FOUND','找不到原預約');
 const [row]=await tx.$queryRaw<{chargeRuleSnapshot:unknown;ruleIsNull?:boolean}[]>`SELECT "chargeRuleSnapshot",("chargeRuleSnapshot" IS NULL) AS "ruleIsNull" FROM "BeautyAppointment" WHERE "storeId"=${storeId} AND id=${id}`;
 if(!row)throw new AppError('NOT_FOUND','找不到原預約快照');
 let chargeId=`service:${item.serviceId}`,serviceIds=[item.serviceId];
 if(item.cardId){const card=await tx.beautyCard.findFirst({where:{id:item.cardId,storeId}});if(!card)throw new AppError('CONFLICT','原預約方案待核對');chargeId=`plan:${card.planId}`;if(row.chargeRuleSnapshot!==null)serviceIds=card.serviceIds;}
 try{return {item,snapshot:snapshotStoredChargeRule(storedColumn(row.chargeRuleSnapshot,row.ruleIsNull),{storeId,chargeId,revision:0,serviceIds},storeId,'snapshot')};}catch{throw new AppError('CONFLICT','原預約收費規則待核對');}
}
export function chargeAllowedIds(snapshot:unknown,storeId:string,serviceId:string){try{return resolveChargeTechnicians(storedChargeRule.parse(snapshot).rule,storeId,serviceId);}catch{throw new AppError('CONFLICT','收費方式不適用此服務或規則損壞');}}
export async function writeCardCharge(tx:ChargeTx,storeId:string,id:string,snapshot:unknown){const value=storedChargeRule.parse(snapshot);const count=await tx.$executeRaw`UPDATE "BeautyCard" SET "chargeRuleSnapshot"=${JSON.stringify(value)}::jsonb WHERE "storeId"=${storeId} AND id=${id}`;if(count!==1)throw new AppError('CONFLICT','方案快照未儲存');}
export async function writeAppointmentCharge(tx:ChargeTx,storeId:string,id:string,snapshot:unknown){const value=storedChargeRule.parse(snapshot);const count=await tx.$executeRaw`UPDATE "BeautyAppointment" SET "chargeRuleSnapshot"=${JSON.stringify(value)}::jsonb WHERE "storeId"=${storeId} AND id=${id}`;if(count!==1)throw new AppError('CONFLICT','預約快照未儲存');}
/** Preserve an existing restriction when unrelated catalog fields advance the row revision. */
export async function maintainCatalogCharge(tx:ChargeTx,storeId:string,kind:'service'|'plan',record:{id:string;revision:number;serviceIds?:string[]},isNew:boolean){
 if(!beautyChargeRulesEnabled(storeId))return;
 if(kind==='service'&&isNew){await tx.$executeRaw`UPDATE "BeautyService" SET "singlePriceConfigured"=false WHERE "storeId"=${storeId} AND id=${record.id}`;return;}
 const {row,owner}=await readCatalogChargeForRevision(tx,storeId,kind,record);
 storedColumn(row.chargeTechnicianRule,row.ruleIsNull);
 if(row.chargeTechnicianRule===null)return;
 let value;try{value=storedChargeRule.parse(row.chargeTechnicianRule);if(value.rule.revision!==record.revision-1)throw Error('規則版本不符');readStoredChargeRule(value,{...owner,revision:value.rule.revision},storeId,'catalog');}catch{throw new AppError('CONFLICT','收費服務範圍或規則已變更，請重新核對');}
 const json=JSON.stringify({...value,rule:{...value.rule,revision:record.revision}});
 if(kind==='service')await tx.$executeRaw`UPDATE "BeautyService" SET "chargeTechnicianRule"=${json}::jsonb WHERE "storeId"=${storeId} AND id=${record.id}`;
 else await tx.$executeRaw`UPDATE "BeautyPlan" SET "chargeTechnicianRule"=${json}::jsonb WHERE "storeId"=${storeId} AND id=${record.id}`;
}
async function readCatalogChargeForRevision(tx:ChargeTx,storeId:string,kind:'service'|'plan',record:{id:string;revision:number;serviceIds?:string[]}){
 const rows=kind==='service'?await tx.$queryRaw<CatalogRow[]>`SELECT id,revision,"chargeTechnicianRule",("chargeTechnicianRule" IS NULL) AS "ruleIsNull" FROM "BeautyService" WHERE "storeId"=${storeId} AND id=${record.id}`:await tx.$queryRaw<CatalogRow[]>`SELECT id,revision,"chargeTechnicianRule","serviceIds",("chargeTechnicianRule" IS NULL) AS "ruleIsNull" FROM "BeautyPlan" WHERE "storeId"=${storeId} AND id=${record.id}`;
 if(!rows[0]||rows[0].revision!==record.revision)throw new AppError('CONFLICT','收費資料已更新');
 return {row:rows[0],owner:{storeId,chargeId:`${kind==='service'?'service':'plan'}:${record.id}`,revision:record.revision,serviceIds:kind==='service'?[record.id]:rows[0].serviceIds!}};
}
/** Batch the extra metadata: no per-row reads or new public catalog disclosure. */
export async function readChargeCatalogForUi(tx:ChargeTx,storeId:string){
 const [singles,plans]=await Promise.all([
  tx.$queryRaw<(CatalogRow&{singlePriceConfigured:boolean|null;singleChargeName:string|null})[]>`SELECT id,revision,"singleChargeName","singlePriceConfigured","chargeTechnicianRule",("chargeTechnicianRule" IS NULL) AS "ruleIsNull" FROM "BeautyService" WHERE "storeId"=${storeId}`,
  tx.$queryRaw<(CatalogRow&{serviceIds:string[]})[]>`SELECT id,revision,"serviceIds","chargeTechnicianRule",("chargeTechnicianRule" IS NULL) AS "ruleIsNull" FROM "BeautyPlan" WHERE "storeId"=${storeId}`,
 ]);
 return {enabled:true as const,editingEnabled:beautyChargeEditingEnabled(storeId),singles:singles.map(row=>({id:row.id,revision:row.revision,name:row.singleChargeName,configured:row.singlePriceConfigured,rule:readStoredChargeRule(storedColumn(row.chargeTechnicianRule,row.ruleIsNull),{storeId,chargeId:`service:${row.id}`,revision:row.revision,serviceIds:[row.id]},storeId,'catalog')})),plans:plans.map(row=>({id:row.id,revision:row.revision,rule:readStoredChargeRule(storedColumn(row.chargeTechnicianRule,row.ruleIsNull),{storeId,chargeId:`plan:${row.id}`,revision:row.revision,serviceIds:row.serviceIds},storeId,'catalog')}))};
}
/** Called only during the first explicit service creation, under the store write lock. Never from a read check. */
export async function initializeEmptyBeautyOpening(tx:ChargeTx,storeId:string){
 if(!beautyChargeRulesEnabled(storeId)||await tx.beautySetting.findUnique({where:{storeId}}))return;
 if(await isEmptyBeautyStore(tx,storeId))await tx.beautySetting.create({data:{storeId,selfBooking:false}});
}

export async function isEmptyBeautyStore(tx:ChargeTx,storeId:string){
 const counts=await Promise.all([tx.beautyService.count({where:{storeId}}),tx.beautyPlan.count({where:{storeId}}),tx.beautyCard.count({where:{storeId}}),tx.beautyAppointment.count({where:{storeId}})]);
 return counts.every(count=>count===0);
}

function storedColumn(value:unknown,isSqlNull?:boolean){
 if(value===null&&isSqlNull===false)throw new AppError('CONFLICT','收費規則不可為 JSON null');
 return value;
}
