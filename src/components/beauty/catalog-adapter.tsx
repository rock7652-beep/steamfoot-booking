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
 const form:CoursePlanCatalogPort={save:async(input,plan)=>{
  if(!canEdit)return {success:false,error:'沒有管理權限'};
  if(input.sportsMode!==undefined){
   if(input.unit!=='SESSION')return {success:false,error:'美業核心尚未支援點數方案，本次未儲存；不可將點數當作次數扣除。'};
   if(input.sportsMode==='OPEN')return {success:false,error:'美業核心尚未支援開放選課通用卡，本次未儲存。'};
   if(!services.some(s=>s.id===input.subjectId))return {success:false,error:'請選擇本店服務項目'};
  }
  const prior=plan?(plan.catalogSnapshot?savedBeautyPlan.parse(plan.catalogSnapshot):data.plans.find(p=>'plan:'+p.id===plan.id)):undefined;
  if(plan&&(!prior||'plan:'+prior.id!==plan.id||plan.catalogRevision!==prior.revision))return {success:false,error:'方案已更新，請關閉後重新開啟'};
  if(input.sportsMode==='LEGACY'&&prior&&Array.isArray(input.coachIds)){
   const expected=data.techs.filter(t=>t.serviceIds.includes(prior.serviceIds[0])).map(t=>t.id).sort();
   if(JSON.stringify([...input.coachIds].sort())!==JSON.stringify(expected))return {success:false,error:'原版可服務技師的修改接點尚未完成，本次未儲存；不會忽略此修改。'};
  }
  const serviceIds=input.sportsMode==='LEGACY'&&prior&&input.subjectId===prior.serviceIds[0]?prior.serviceIds:input.templateIds;
  const lowBalanceEnabled=input.lowBalanceEnabled??prior?.lowBalanceEnabled??false;
  const rawThreshold=input.lowBalanceThreshold===undefined?prior?.lowBalanceThreshold??null:input.lowBalanceThreshold;
  const lowBalanceThreshold=input.lowBalanceEnabled===undefined&&input.lowBalanceThreshold===undefined?prior?.lowBalanceThreshold??null:lowBalanceEnabled&&rawThreshold!=null?Number(rawThreshold):null;
  const r=await saveBeautyCatalog('plan',{id:prior?.id,revision:prior?.revision??0,name:input.name,sessions:input.points,price:input.price,validDays:input.validDays,serviceIds,allowShared:input.allowShared,customerPurchasable:input.customerPurchasable,active:input.isActive,lowBalanceEnabled,lowBalanceThreshold});
  if(!r.success)return r;const record=savedBeautyPlan.parse(r.data.record);const saved={...beautySessionProduct(record),sportsMode:record.serviceIds.length===1?'ASSIGNED':'LEGACY',sportsSubjectId:record.serviceIds[0]??null,sportsCost:1};refresh();return {success:true,data:saved};
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
 if(tab==='收費方式')return <CourseMemberWorkspace subjectLabel="服務項目" sportsNative sportsData={beautyFeeSnapshot(data,products)} subjects={services.map(s=>({id:s.id,name:s.name,category:s.category,isActive:s.active}))} view="plans" catalogSource={{status,form,order:saveBeautyDisplayOrder}} displayOrder={data.displayOrders?.plan} previewStoreId={data.storeId} templates={templates} people={[]} plans={products} cards={[]} canEdit={canEdit} canCreate={canEdit} canManageStaff={false} canAssign={false} canReadBookings={false} canReadTransactions={false} healthEnabled={false} customerRows={[]} canReadCards={false} assignmentStaff={[]} canAssignManager={false} profitEnabled={false}/>;
 return <CourseWorkspace rentalCustomers={data.customers.map(c=>({id:c.id,name:c.name,phone:c.phone}))} rentalPermissions={{customerRead:data.access.customerAccess,customerCreate:!!data.manage.customer,collect:data.manage.collect,correct:!!data.manage.refund,edit:canEdit}} catalogSource={{rentalModule:"beauty",status,save,order:saveBeautyDisplayOrder}} displayOrder={data.displayOrders?.[tab==='位置管理'?'room':'subject']} view={tab==='位置管理'?'rooms':'catalog'} businessProfile="FITNESS" storeId={data.storeId} selectedDate={data.date} today={toLocalDateStr()} nowIso={new Date(data.now).toISOString()} calendarDays={{}} rooms={rooms} templates={templates} sessions={[]} coaches={[]} cancelledBookings={[]} staffAvailability={[]} staffAvailabilityExceptions={[]} canCreate={canEdit} canEdit={canEdit}/>;
}
