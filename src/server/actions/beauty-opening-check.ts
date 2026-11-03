"use server";
import {z} from 'zod';
import {prisma} from '@/lib/db';
import {beautyPrisma} from '@/lib/beauty-db';
import {beautyManager} from '@/server/beauty/access';
import {beautyChargeRulesEnabled,readCatalogCharge} from '@/server/beauty/charge-runtime';
import {loadAvailability,findAllocation} from '@/server/beauty/booking';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {requirePermission} from '@/lib/permissions';
import {toLocalDateStr,addTaiwanDuration} from '@/lib/date-utils';
import {AppError,handleActionError} from '@/lib/errors';
import type {Prisma} from '../../../generated/beauty-client';
import type {BeautyOpeningStep} from '@/lib/beauty/opening-guide';
export async function readBeautyOpeningCheck(input:unknown){
 try{
  const actor=await beautyManager('business_hours.view');await requirePermission('plans.edit');await requirePermission('staff.view');await requireStoreFeature(actor.storeId,FEATURES.PLAN_MANAGEMENT);await requireStoreFeature(actor.storeId,FEATURES.STAFF_MANAGEMENT);
  const {storeId}=z.object({storeId:z.string().min(1)}).parse(input);
  if(storeId!==actor.storeId||!beautyChargeRulesEnabled(storeId))throw new AppError('FORBIDDEN','本店開店檢查尚未啟用');
  const tx=beautyPrisma as unknown as Prisma.TransactionClient;
  const [store,config,services,plans,technicians]=await Promise.all([
   prisma.store.findUniqueOrThrow({where:{id:storeId},select:{name:true}}),prisma.shopConfig.findUnique({where:{storeId},select:{address:true,shopPhone:true}}),
   tx.beautyService.findMany({where:{storeId,active:true}}),tx.beautyPlan.findMany({where:{storeId,active:true}}),tx.beautyTechnician.findMany({where:{storeId,active:true}}),
  ]);
  const today=toLocalDateStr(),days=await Promise.all(Array.from({length:7},(_,i)=>addTaiwanDuration(today,i,'DAY')).map(date=>loadAvailability(tx,actor,date)));
  const candidates=[];
  for(const service of services){const source=await readCatalogCharge(tx,storeId,'single',service.id);candidates.push({name:source.row.singleChargeName??service.name,serviceId:service.id,snapshot:source.snapshot,configured:source.row.singlePriceConfigured===true,canPreview:source.row.singlePriceConfigured!==false,needsReview:source.row.singlePriceConfigured===null,trial:false});if(service.trialPrice!==null)candidates.push({name:`${source.row.singleChargeName??service.name}・體驗`,serviceId:service.id,snapshot:source.snapshot,configured:source.row.singlePriceConfigured===true,canPreview:source.row.singlePriceConfigured!==false,needsReview:source.row.singlePriceConfigured===null,trial:true});}
  for(const plan of plans){const source=await readCatalogCharge(tx,storeId,'plan',plan.id);for(const serviceId of plan.serviceIds)candidates.push({name:plan.name,serviceId,snapshot:source.snapshot,configured:source.snapshot.rule.mode==='SELECTED',canPreview:true,needsReview:source.snapshot.rule.mode==='LEGACY_UNRESTRICTED',trial:false});}
  const samples:{name:string;serviceId:string;date:string|null;time:string|null;reason:string}[]=[];
  for(const candidate of candidates){
   let found:{date:string;time:string}|null=null;
   if(candidate.canPreview)for(const [i,loaded] of days.entries()){
    const date=addTaiwanDuration(today,i,'DAY');
    for(const time of loaded.memberSlots){try{await findAllocation(tx,actor,{date,time,people:[{name:'開店檢查',phone:'',customerId:null,serviceId:candidate.serviceId,serviceRevision:0,preference:'ANY',specifiedTechnicianId:null,cardId:null,notes:'',isTrial:candidate.trial}]},[],undefined,loaded,false,undefined,[candidate.snapshot]);found={date,time};break;}catch(error){if(!(error instanceof AppError))throw error;}}
    if(found)break;
   }
   samples.push({name:candidate.name,serviceId:candidate.serviceId,date:found?.date??null,time:found?.time??null,reason:found?'可安排':candidate.canPreview?'未來 7 天沒有完整可安排時段，請核對排班、技師、位置、整理時間及預約期限':'尚未明確確認價格或可安排技師，請先儲存收費設定'});
  }
  const checks:{id:string;status:BeautyOpeningStep['status'];detail:string}[]=[
   {id:'store',status:store.name.trim()&&config?.shopPhone?.trim()&&config?.address?.trim()?'present':'missing',detail:'核對店名、電話、地址'},
   {id:'hours',status:days.some(day=>day.memberSlots.length)?'present':'missing',detail:'檢查未來 7 天的營業、公休與可開放時間；取消規則仍請店家核對'},
   {id:'locations',status:days[0].locations.length?'present':'missing',detail:'至少一個啟用位置'},
   {id:'services',status:services.length?'present':'missing',detail:`${services.length} 項啟用服務`},
   {id:'technicians',status:technicians.some(t=>services.some(s=>t.serviceIds.includes(s.id)))?'present':'missing',detail:'實際資格、計酬與排班在各收費時段檢查中核對'},
   {id:'charges',status:!candidates.length||candidates.some(c=>!c.canPreview)?'missing':candidates.some(c=>c.needsReview)?'review':'present',detail:candidates.some(c=>c.needsReview)?'既有收費保留原規則；請確認繼續沿用，或到收費方式明確設定價格及技師。不強迫重建舊方案':'單次明確設定價格與技師；多次選定允許技師。未提供次數方案可略過'},
   {id:'staff',status:'review',detail:'目前帳號已通過檢查所需權限；其他人員角色及收款權限仍由店家核對'},
   {id:'review',status:samples.length&&samples.every(s=>s.date)?'present':'missing',detail:'只檢查未來 7 天可安排性，不保證之後每個時段都有空位，也不會開放預約'},
  ];
  return {success:true as const,storeId,checkedAt:Date.now(),checks,samples,selfBooking:days[0].policy.selfBooking};
 }catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?'開店檢查未完成':result.error};}
}
