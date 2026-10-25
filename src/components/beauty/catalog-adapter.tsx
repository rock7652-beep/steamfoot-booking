"use client";
import type {MusicSubjectView} from "@/app/(dashboard)/dashboard/courses/music-subject-catalog";
import {saveBeautyDisplayOrder} from "@/server/actions/beauty-display-order";
import {useRouter} from 'next/navigation';
import type {Room,Template,CourseCatalogSource} from '@/app/(dashboard)/dashboard/courses/workspace';
import dynamic from 'next/dynamic';
const MusicSubjectCatalog=dynamic(()=>import('@/app/(dashboard)/dashboard/courses/music-subject-catalog').then(m=>m.MusicSubjectCatalog));
const CourseWorkspace=dynamic(()=>import('@/app/(dashboard)/dashboard/courses/workspace').then(m=>m.CourseWorkspace));
const CourseMemberWorkspace=dynamic(()=>import('@/app/(dashboard)/dashboard/courses/member-workspace').then(m=>m.CourseMemberWorkspace));
import type {Plan,CoursePlanCatalogPort} from '@/app/(dashboard)/dashboard/courses/course-profile-forms';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {CatalogStatusDriver} from '@/lib/course-catalog-driver';
import {saveBeautyCatalog,saveBeautyLocation} from '@/server/actions/beauty';
import {beautySessionProduct,savedBeautyPlan,savedBeautyService,savedBeautyLocation} from '@/lib/beauty/catalog-adapter';
import {savedBeautyFee} from '@/lib/beauty/native-plan';
import {saveBeautyServicePrice} from "@/server/actions/beauty-service-price";
import {saveBeautyNativePlan} from '@/server/actions/beauty-native-plan';
import {nativeBeautyService,savedBeautySubject} from '@/lib/beauty/native-service';
import {saveBeautyNativeService} from '@/server/actions/beauty-native-service';
import {toLocalDateStr} from '@/lib/date-utils';
import type {SportsSnapshot} from '@/lib/sports-staging-types';

/** Read shape of the original sports fee page; no synthetic single/trial products. */
export function beautyFeeSnapshot(data:BeautyDashboardData,products:Plan[]):SportsSnapshot {
 return {
  storeId:data.storeId,date:data.date,
  subjects:data.services.map(s=>({id:s.id,name:s.name,category:s.category,active:s.active,updatedAt:String(s.revision),templateId:s.id})),
  fees:products.map(p=>({id:p.id,name:p.name,subject:p.sportsSubjectId??'',sportsMode:p.sportsMode,unit:'堂數',amount:p.points,price:p.price,days:p.validDays,cost:1,shared:!!p.allowShared,templateId:p.templateIds[0]??'',snapshot:JSON.stringify(p.catalogSnapshot)})),
  lessons:[],students:[],customers:[],
  coaches:data.techs.map(t=>({id:t.id,name:t.name,templates:t.serviceIds})),
  rooms:data.locations.map(r=>({id:r.id,name:r.name,capacity:r.capacity??1,rental:!!r.rentalEnabled})),
 };
}

/** Data and mutation wiring only: the course components own all page UI. */
export function createBeautyCatalogAdapter(tab:string,data:BeautyDashboardData,canEdit:boolean,refresh:()=>void){
 const services=data.services.map(s=>savedBeautyService.parse(s));
 const products:Plan[]=data.plans.map(p=>({...beautySessionProduct(savedBeautyPlan.parse(p)),sportsMode:p.serviceIds.length===1?'ASSIGNED':'LEGACY',sportsSubjectId:p.serviceIds[0]??null,sportsCost:1}));
 const status:CatalogStatusDriver={impact:async()=>({success:true,count:0}),apply:async({ids,active})=>{
  if(!canEdit)return {success:false,error:'沒有管理權限'};
  const succeeded:string[]=[],failed:{id:string;error:string}[]=[];
  for(const id of ids){
   let result:{success:boolean;error?:string};
   if(tab==='位置管理'){const row=data.locations.find(r=>r.id===id);result=row?await saveBeautyLocation({...row,active}):{success:false,error:'位置已更新，請重新整理'};}
   else if(tab==='服務項目'){const row=services.find(r=>r.id===id);result=row?await saveBeautyCatalog('service',{...row,active}):{success:false,error:'服務已更新，請重新整理'};}
   else{const row=data.plans.find(r=>'plan:'+r.id===id);result=row?await saveBeautyCatalog('plan',{...row,active}):{success:false,error:'收費方式已更新，請重新整理'};}
   if(result.success)succeeded.push(id);else failed.push({id,error:result.error??'儲存失敗'});
  }
  return {success:true,succeeded,failed};
 }};
 const form:CoursePlanCatalogPort={compact:true,confirmDiscard:false,servicePricing:data.chargeRulesActive?undefined:{rows:services.map(s=>({id:s.id,name:s.name,revision:s.revision,price:s.price,trialPrice:s.trialPrice,duration:s.duration,trialDuration:s.trialDuration??null})),transport:saveBeautyServicePrice},units:['SESSION'],sportsModes:['ASSIGNED','LEGACY'],sessionLabel:'次數',canEditCoaches:!!data.manage?.technician&&!data.chargeRulesActive,rowSchema:savedBeautyFee,transport:async input=>{const r=await saveBeautyNativePlan(input);if(r.success)refresh();return r;},values:(input,plan)=>{
  const prior=plan?.catalogSnapshot?savedBeautyPlan.parse(plan.catalogSnapshot):undefined;
  const subjectId=input.subjectId??(input.templateIds as string[]|undefined)?.[0]??prior?.serviceIds[0];
  const service=services.find(s=>s.id===subjectId);
  return {id:prior?.id,revision:prior?.revision,unit:input.unit??'SESSION',sportsMode:input.sportsMode??(prior&&prior.serviceIds.length>1?'LEGACY':'ASSIGNED'),subjectId,name:input.name,sessions:input.points,price:input.price,validDays:input.validDays,active:input.isActive,allowShared:input.allowShared,customerPurchasable:input.customerPurchasable,...(input.lowBalanceEnabled===undefined?{}:{lowBalanceEnabled:input.lowBalanceEnabled}),...(input.lowBalanceThreshold===undefined?{}:{lowBalanceThreshold:input.lowBalanceThreshold===null?null:Number(input.lowBalanceThreshold)}),...(!data.chargeRulesActive&&input.sportsMode==='LEGACY'&&data.manage?.technician&&service?{qualification:{coachIds:input.coachIds,expectedCoachIds:data.techs.filter(t=>t.serviceIds.includes(service.id)).map(t=>t.id),serviceRevision:service.revision}}:{})};
 },save:async(input,plan)=>{
  if(!canEdit)return {success:false,error:'沒有管理權限'};
  const result=await saveBeautyNativePlan({...form.values!(input,plan),expectedStoreId:data.storeId,requestKey:typeof input.requestKey==='string'?input.requestKey:crypto.randomUUID()});
  if(!result.success)return result;refresh();return {success:true,data:savedBeautyFee.parse(result.data)};
 }};
 const templates:Template[]=services.map(s=>({id:s.id,name:s.name,category:s.category,isActive:s.active,visibility:s.active?'PUBLIC':'OFF',durationMinutes:s.duration,bufferMinutes:s.buffer,catalogRevision:s.revision,catalogSnapshot:{...s},capacity:1,pointCost:1,defaultRoomId:null}));

 const rooms:Room[]=data.locations.map(r=>({...r,catalogSnapshot:{...r},capacity:r.capacity??1}));
 const save:CourseCatalogSource['save']=async(kind,input)=>{
  if(!canEdit)return {success:false,error:'沒有管理權限'};
  if(kind==='room'){
   const prior=input.catalogSnapshot?savedBeautyLocation.parse(input.catalogSnapshot):data.locations.find(r=>r.id===input.id);
   if(input.id&&(!prior||prior.id!==input.id))return {success:false,error:'位置已更新，請重新整理'};
   const rawCapacity=input.capacity??input.roomCapacity;
   const r=await saveBeautyLocation({id:prior?.id,name:input.name,active:prior?.isActive??true,category:input.category??'',details:input.details??'',equipment:input.equipment??'',location:input.location??'',capacity:rawCapacity==null||rawCapacity===''?prior?.capacity??1:Number(rawCapacity),rentalEnabled:input.rentalEnabled===true||input.rentalEnabled==='yes',rentalHourlyRate:Number(input.rentalHourlyRate??prior?.rentalHourlyRate??0),rentalBufferMinutes:Number(input.rentalBufferMinutes??prior?.rentalBufferMinutes??0)});
   if(!r.success)return r;return {success:true,data:{...savedBeautyLocation.parse(r.data.record),catalogSnapshot:{...savedBeautyLocation.parse(r.data.record)},capacity:savedBeautyLocation.parse(r.data.record).capacity??1}};
  }
  const prior=input.catalogSnapshot?savedBeautyService.parse(input.catalogSnapshot):services.find(s=>s.id===input.id);
  if(input.id&&(!prior||prior.id!==input.id||input.catalogRevision!==prior.revision))return {success:false,error:'服務已更新，請關閉後重新開啟'};
  const r=await saveBeautyCatalog('service',{id:prior?.id,revision:prior?.revision??0,name:input.name,category:input.category??'',duration:input.durationMinutes,buffer:input.bufferMinutes??0,price:prior?.price??0,trialPrice:prior?.trialPrice??null,active:prior?.active??true});
  if(!r.success)return r;const s=savedBeautyService.parse(r.data.record);return {success:true,data:{id:s.id,name:s.name,category:s.category,isActive:s.active,visibility:s.active?'PUBLIC':'OFF',durationMinutes:s.duration,bufferMinutes:s.buffer,catalogRevision:s.revision,catalogSnapshot:{...s},capacity:1,pointCost:1,defaultRoomId:null}};
 };
 return {products,status,form,templates,rooms,save};
}
export function BeautyCourseCatalog({tab,data,canEdit}:{tab:string;data:BeautyDashboardData;canEdit:boolean}){
 const router=useRouter();const services=data.services.map(s=>savedBeautyService.parse(s));const {products,status,form,templates,rooms,save}=createBeautyCatalogAdapter(tab,data,canEdit,()=>router.refresh());
 if(tab==='服務項目'){
  const canEditRules=!!data.manage.technician&&data.access.feeAccess;
  const subject=(s:typeof services[number]):MusicSubjectView=>nativeBeautyService(s,data.techs.filter(t=>t.serviceIds.includes(s.id)).map(t=>t.id));
  return <MusicSubjectCatalog sportsNative sportsCoaches={data.access.feeAccess?data.techs.map(t=>({id:t.id,name:t.name})):undefined} storeId={data.storeId} subjects={services.map(subject)} displayOrder={data.displayOrders?.subject} canCreate={canEdit} canEdit={canEdit} catalog={{label:'服務項目',serviceRules:true,canEditRules,status,order:saveBeautyDisplayOrder,rowSchema:savedBeautySubject,transport:async input=>{const result=await saveBeautyNativeService(input);if(result.success)router.refresh();return result;},values:(form,row)=>{
   const prior=row?.catalogSnapshot?savedBeautyService.parse(row.catalogSnapshot):undefined;
   const mode=String(form.get('sportsCompensationMode')??'');
   const raw=String(form.get('sportsCompensationValue')??'').trim();
   if(canEditRules&&mode&&(!raw||!Number.isFinite(Number(raw))))throw new Error('請填寫預設計酬金額或百分比');
   const defaultRate=!mode?null:mode==='CLASS'?{mode:'FIXED',value:Number(raw)}:mode==='HOUR'?{mode:'HOURLY',value:Number(raw)}:{mode:'PERCENT',value:Number(raw),base:prior?.defaultRate?.mode==='PERCENT'?prior.defaultRate.base:'PAID'};
   return {id:row?.id,revision:row?.revision,name:String(form.get('name')??''),category:String(form.get('category')??''),duration:Number(form.get('duration')),buffer:Number(form.get('buffer')||0),active:form.get('active')==='yes',...(canEditRules?{rule:{coachIds:form.getAll('sportsCoachIds'),expectedCoachIds:row?.sportsRule?.coachIds??[],defaultRate}}:{})};
  },feeHref:id=>`?tab=收費方式&serviceId=${encodeURIComponent(id)}`,fields:row=>{const service=row?.catalogSnapshot?savedBeautyService.parse(row.catalogSnapshot):undefined;return <><label>服務時長（分鐘）<input className="min-h-11 w-full rounded-lg border border-earth-200 px-3 py-2" name="duration" type="number" min={5} max={720} required defaultValue={service?.duration}/></label><label>整理時間（分鐘，選填）<input className="min-h-11 w-full rounded-lg border border-earth-200 px-3 py-2" name="buffer" type="number" min={0} max={240} defaultValue={service?.buffer??0}/></label></>;},save:async()=>({success:false,error:'請透過共用儲存接點送出'})}}/>;
 }
 if(tab==='收費方式')return <CourseMemberWorkspace subjectLabel="服務項目" sportsNative sportsData={beautyFeeSnapshot(data,products)} subjects={services.map(s=>({id:s.id,name:s.name,category:s.category,isActive:s.active}))} view="plans" catalogSource={{status,form,order:saveBeautyDisplayOrder}} displayOrder={data.displayOrders?.plan} previewStoreId={data.storeId} templates={templates} people={[]} plans={products} cards={[]} canEdit={canEdit} canCreate={canEdit&&!data.chargeRulesActive} canManageStaff={false} canAssign={false} canReadBookings={false} canReadTransactions={false} healthEnabled={false} customerRows={[]} canReadCards={false} assignmentStaff={[]} canAssignManager={false} profitEnabled={false}/>;
 return <CourseWorkspace rentalCustomers={data.customers.map(c=>({id:c.id,name:c.name,phone:c.phone}))} rentalPermissions={{create:canEdit&&data.access.writeAccess,customerRead:data.access.customerAccess,customerCreate:!!data.manage.customer,collect:data.manage.collect,correct:!!data.manage.refund,edit:canEdit}} catalogSource={{rentalModule:"beauty",status,save,order:saveBeautyDisplayOrder}} displayOrder={data.displayOrders?.[tab==='位置管理'?'room':'subject']} view={tab==='位置管理'?'rooms':'catalog'} businessProfile="FITNESS" storeId={data.storeId} selectedDate={data.date} today={toLocalDateStr()} nowIso={new Date(data.now).toISOString()} calendarDays={{}} rooms={rooms} templates={templates} sessions={[]} coaches={[]} cancelledBookings={[]} staffAvailability={[]} staffAvailabilityExceptions={[]} canCreate={canEdit} canEdit={canEdit}/>;
}
