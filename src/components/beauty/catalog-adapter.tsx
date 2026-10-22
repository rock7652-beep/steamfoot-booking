"use client";
import {useRouter} from 'next/navigation';
import type {Room,Template,CourseCatalogSource} from '@/app/(dashboard)/dashboard/courses/workspace';
import dynamic from 'next/dynamic';
const CourseWorkspace=dynamic(()=>import('@/app/(dashboard)/dashboard/courses/workspace').then(m=>m.CourseWorkspace));
const CourseMemberWorkspace=dynamic(()=>import('@/app/(dashboard)/dashboard/courses/member-workspace').then(m=>m.CourseMemberWorkspace));
import type {Plan,CoursePlanCatalogPort} from '@/app/(dashboard)/dashboard/courses/course-profile-forms';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {CatalogStatusDriver} from '@/lib/course-catalog-driver';
import {saveBeautyCatalog,saveBeautyLocation} from '@/server/actions/beauty';
import {beautySessionProduct,beautySingleProduct,beautyPricePatch,savedBeautyPlan,savedBeautyService,savedBeautyLocation} from '@/lib/beauty/catalog-adapter';
import {toLocalDateStr} from '@/lib/date-utils';

/** Data and mutation wiring only: the course components own all page UI. */
export function createBeautyCatalogAdapter(tab:string,data:BeautyDashboardData,canEdit:boolean,refresh:()=>void){
 const services=data.services.map(s=>savedBeautyService.parse(s));
 const products:Plan[]=[...services.flatMap(s=>[beautySingleProduct(s,'single'),beautySingleProduct(s,'trial')]),...data.plans.map(p=>beautySessionProduct(savedBeautyPlan.parse(p)))];
 const status:CatalogStatusDriver={impact:async()=>({success:true,count:0}),apply:async({ids,active})=>{
  if(!canEdit)return {success:false,error:'沒有管理權限'};
  const succeeded:string[]=[],failed:{id:string;error:string}[]=[];
  for(const id of ids){
   let result:{success:boolean;error?:string};
   if(tab==='位置管理'){const row=data.locations.find(r=>r.id===id);result=row?await saveBeautyLocation({...row,active}):{success:false,error:'位置已更新，請重新整理'};}
   else if(tab==='服務項目'){const row=services.find(r=>r.id===id);result=row?await saveBeautyCatalog('service',{...row,active}):{success:false,error:'服務已更新，請重新整理'};}
   else{const row=data.plans.find(r=>'plan:'+r.id===id);result=row?await saveBeautyCatalog('plan',{...row,active}):{success:false,error:'單次與體驗費用請從編輯調整，服務狀態由服務項目管理'};}
   if(result.success)succeeded.push(id);else failed.push({id,error:result.error??'儲存失敗'});
  }
  return {success:true,succeeded,failed};
 }};
 const form:CoursePlanCatalogPort={save:async(input,plan)=>{
  if(!canEdit)return {success:false,error:'沒有管理權限'};
  const kind=plan?.catalogKind??input.catalogKind;
  if(kind==='single'||kind==='trial'){
   const ids=input.templateIds as string[];const current=plan?.catalogSnapshot?savedBeautyService.parse(plan.catalogSnapshot):services.find(s=>s.id===(plan?.templateIds[0]??ids[0]));
   if(!current||plan&&current.id!==plan.templateIds[0])return {success:false,error:'請選擇本店服務'};
   if(plan&&plan.catalogRevision!==current.revision)return {success:false,error:'服務已更新，請關閉後重新開啟'};
   const r=await saveBeautyCatalog('service',beautyPricePatch(current,kind,input.catalogPriceValue));
   if(!r.success)return r;
   const saved=beautySingleProduct(savedBeautyService.parse(r.data.record),kind);refresh();return {success:true,data:saved};
  }
  if(kind!=='plan')return {success:false,error:'請選擇收費類型'};
  const prior=plan?(plan.catalogSnapshot?savedBeautyPlan.parse(plan.catalogSnapshot):data.plans.find(p=>'plan:'+p.id===plan.id)):undefined;
  if(plan&&(!prior||'plan:'+prior.id!==plan.id||plan.catalogRevision!==prior.revision))return {success:false,error:'方案已更新，請關閉後重新開啟'};
  const r=await saveBeautyCatalog('plan',{id:prior?.id,revision:prior?.revision??0,name:input.name,sessions:input.points,price:input.price,validDays:input.validDays,serviceIds:input.templateIds,allowShared:input.allowShared,customerPurchasable:input.customerPurchasable,active:input.isActive,lowBalanceEnabled:input.lowBalanceEnabled,lowBalanceThreshold:input.lowBalanceEnabled?Number(input.lowBalanceThreshold):null});
  if(!r.success)return r;const saved=beautySessionProduct(savedBeautyPlan.parse(r.data.record));refresh();return {success:true,data:saved};
 }};
 const templates:Template[]=services.map(s=>({id:s.id,name:s.name,category:s.category,isActive:s.active,visibility:s.active?'PUBLIC':'OFF',durationMinutes:s.duration,bufferMinutes:s.buffer,catalogRevision:s.revision,catalogSnapshot:{...s},capacity:1,pointCost:1,defaultRoomId:null}));

 const rooms:Room[]=data.locations.map(r=>({...r,catalogSnapshot:{...r},capacity:1}));
 const save:CourseCatalogSource['save']=async(kind,input)=>{
  if(!canEdit)return {success:false,error:'沒有管理權限'};
  if(kind==='room'){
   const prior=input.catalogSnapshot?savedBeautyLocation.parse(input.catalogSnapshot):data.locations.find(r=>r.id===input.id);
   if(input.id&&(!prior||prior.id!==input.id))return {success:false,error:'位置已更新，請重新整理'};
   const r=await saveBeautyLocation({id:prior?.id,name:input.name,active:prior?.isActive??true,category:input.category??'',details:input.details??'',equipment:input.equipment??'',location:input.location??''});
   if(!r.success)return r;return {success:true,data:{...savedBeautyLocation.parse(r.data.record),catalogSnapshot:{...savedBeautyLocation.parse(r.data.record)},capacity:1}};
  }
  const prior=input.catalogSnapshot?savedBeautyService.parse(input.catalogSnapshot):services.find(s=>s.id===input.id);
  if(input.id&&(!prior||prior.id!==input.id||input.catalogRevision!==prior.revision))return {success:false,error:'服務已更新，請關閉後重新開啟'};
  const r=await saveBeautyCatalog('service',{id:prior?.id,revision:prior?.revision??0,name:input.name,category:input.category??'',duration:input.durationMinutes,buffer:input.bufferMinutes??0,price:prior?.price??0,trialPrice:prior?.trialPrice??null,active:prior?.active??true});
  if(!r.success)return r;const s=savedBeautyService.parse(r.data.record);return {success:true,data:{id:s.id,name:s.name,category:s.category,isActive:s.active,visibility:s.active?'PUBLIC':'OFF',durationMinutes:s.duration,bufferMinutes:s.buffer,catalogRevision:s.revision,catalogSnapshot:{...s},capacity:1,pointCost:1,defaultRoomId:null}};
 };
 return {products,status,form,templates,rooms,save};
}
export function BeautyCourseCatalog({tab,data,canEdit}:{tab:string;data:BeautyDashboardData;canEdit:boolean}){
 const router=useRouter();const {products,status,form,templates,rooms,save}=createBeautyCatalogAdapter(tab,data,canEdit,()=>router.refresh());
 if(tab==='收費方式')return <CourseMemberWorkspace view="plans" catalogSource={{status,form}} previewStoreId={data.storeId} templates={templates} people={[]} plans={products} cards={[]} canEdit={canEdit} canCreate={canEdit} canManageStaff={false} canAssign={false} canReadBookings={false} canReadTransactions={false} healthEnabled={false} customerRows={[]} canReadCards={false} assignmentStaff={[]} canAssignManager={false} profitEnabled={false}/>;
 return <CourseWorkspace catalogSource={{status,save}} view={tab==='位置管理'?'rooms':'catalog'} businessProfile="FITNESS" storeId={data.storeId} selectedDate={data.date} today={toLocalDateStr()} nowIso={new Date(data.now).toISOString()} calendarDays={{}} rooms={rooms} templates={templates} sessions={[]} coaches={[]} cancelledBookings={[]} staffAvailability={[]} staffAvailabilityExceptions={[]} canCreate={canEdit} canEdit={canEdit}/>;
}
