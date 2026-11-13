"use client";
import {useCallback,useMemo} from 'react';
import {readCustomerPrimary,type CustomerPrimaryInput} from '@/lib/customer-primary-snapshot';
import {usePanelReader,useCustomerReadQueue} from '@/components/operations/panel-read-cache';
import type {CourseCustomerSource} from "@/app/(dashboard)/dashboard/courses/member-source";
import type {browseCourseCards} from '@/server/actions/course-browse';
import {readMusicPeriods} from '@/lib/music-period-read-client';
import type {loadMusicStudentWorkspace} from '@/server/actions/music-student-workspace';
import type {loadCourseCustomerPurchases} from '@/server/actions/course-customer-history';

import {useMemberConnectionReader,useCustomerAdvancedReader,useCoursePhoneReader,useStudentMakeupsReader} from './use-customer-support-readers';
import {readCustomerOverview} from '@/lib/customer-support-read-client';
import {useCourseCardDetailReader} from './use-course-card-detail-reader';
import {useCustomerNextBookingReader} from './use-customer-next-booking-reader';
import {useCourseCardProgressReader} from './use-course-card-progress-reader';
import {useCustomerCardReader,CUSTOMER_PLAN_PRELOAD_TTL} from './use-customer-card-reader';
export {useCustomerCardReader} from './use-customer-card-reader';
const noSupport:NonNullable<CourseCustomerSource['support']>=async()=>({success:false,error:'未開放'});
type ReadinessReader={read:(id:string)=>Promise<void>;get:(id:string)=>boolean;cancel?:(id:string)=>void};
type PlanPreload={reader:ReadinessReader;visibleReader:ReadinessReader;backgroundReader:ReadinessReader;prefetch:(id:string)=>void};
const readStudentWorkspace:typeof loadMusicStudentWorkspace=readCustomerOverview;
const readCustomerPurchases:typeof loadCourseCustomerPurchases=(...args)=>import('@/server/actions/course-customer-history').then(module=>module.loadCourseCustomerPurchases(...args));
export function useCustomerPlanPreload({load,support,bookings,preloadOverview=false,preloadCardDetails=false,preloadCardProgress,getCardProgress,readOverview,seedCardProgress,native=false,music=false,canReadCards,canReadBookings=false,canReadTransactions=false,revision=0,dataScope,storeId=''}: {
 readOverview?:CourseCustomerSource['readOverview'];seedCardProgress?:CourseCustomerSource['seedCardProgress'];preloadOverview?:boolean;bookings?:CourseCustomerSource['bookings'];support?:CourseCustomerSource['support'];preloadCardDetails?:boolean;getCardProgress?:(customerId:string,cardId:string,revision:number)=>unknown;preloadCardProgress?:(customerId:string,cardId:string,revision:number)=>Promise<unknown>;load?:typeof browseCourseCards;native?:boolean;music?:boolean;canReadCards:boolean;canReadBookings?:boolean;canReadTransactions?:boolean;revision?:number;dataScope?:'operational'|'legacy';storeId?:string;
}):PlanPreload{
 const queue=useCustomerReadQueue();
 const cards=useCustomerCardReader({load,native,revision,storeId,canReadBookings});
 const progress=useCourseCardProgressReader(storeId,revision);
 const details=useCourseCardDetailReader(load,storeId,revision,preloadCardDetails);
 const supportReader=usePanelReader(support?'module-customer-support':'disabled-customer-support',support??noSupport,storeId,CUSTOMER_PLAN_PRELOAD_TTL);
 const nextBooking=useCustomerNextBookingReader(revision,bookings,!!load,storeId,preloadCardDetails);
 const membership=useMemberConnectionReader(),advanced=useCustomerAdvancedReader(),phone=useCoursePhoneReader(),makeups=useStudentMakeupsReader();
 const readSupport=useCallback(async(id:string)=>{
  await Promise.allSettled([...(support?[supportReader.read(id)]:[]),...(preloadOverview&&!load?[membership.read(id),advanced.read(id),phone.read(id),...(music&&canReadBookings&&canReadCards?[makeups.read(id,dataScope??"operational")]:[])]:[])]);
 },[support,supportReader,preloadOverview,load,membership,advanced,phone,music,canReadBookings,canReadCards,makeups,dataScope]);
 const getSupport=useCallback((id:string)=>Boolean((!support||supportReader.get(id))&&(!preloadOverview||!!load||membership.get(id)&&advanced.get(id)&&phone.get(id)&&(!music||!canReadBookings||!canReadCards||makeups.get(id,dataScope??"operational")))),[support,supportReader,preloadOverview,load,membership,advanced,phone,music,canReadBookings,canReadCards,makeups,dataScope]);
 const canPreloadProgress=!!storeId&&!load&&canReadCards&&canReadBookings;
 const periods=usePanelReader('music-periods',readMusicPeriods,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const overview=usePanelReader('music-student-workspace',readStudentWorkspace,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const orders=usePanelReader('purchases',readCustomerPurchases,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const primary=usePanelReader(readOverview?'module-primary-snapshot':'customer-primary-snapshot',readOverview??readCustomerPrimary,JSON.stringify([revision,storeId,readOverview?dataScope:dataScope??'operational',music,canReadCards,canReadBookings]),CUSTOMER_PLAN_PRELOAD_TTL);
 const primaryInput=useCallback((customerId:string):CustomerPrimaryInput=>({customerId,storeId,dataScope,music,cards:canReadCards,bookings:canReadBookings}),[storeId,dataScope,music,canReadCards,canReadBookings]);
 const aggregate=!!storeId&&(!load||!!readOverview);
 const readPrimary=useCallback(async(id:string)=>{
  // Native reads treat an omitted scope as operational. Keep consumer-local
  // queue/child keys intact so each mounted scope installs its own snapshot.
  const input:CustomerPrimaryInput={...primaryInput(id),dataScope:readOverview?dataScope:dataScope??'operational'},generation=primary.generation(),cardGeneration=cards.generation(),progressGeneration=progress.generation(),nextGeneration=nextBooking.generation(),overviewGeneration=overview.generation(),phoneGeneration=phone.generation(),makeupsGeneration=makeups.generation();
  const result=await primary.read(input);
  if(primary.generation()!==generation)return;
  if(!result.success)throw Error(result.error);
  const failure=[result.cards,result.next,result.musicOverview,...(result.cards?.success?result.cards.progress?.map(p=>p.result)??[]:[]),...(result.beautyProgress?.map(p=>p.result)??[])].find(r=>r?.success===false);
  if(failure&& !failure.success){primary.invalidate(input);throw Error(failure.error);}
  if(result.cards&&cards.generation()===cardGeneration){
   cards.seed(result.cards,{customerId:id,dataScope,search:'',history:false,page:0});
   if(progress.generation()===progressGeneration)for(const item of result.cards.progress??[])progress.seed(item.result,{cardId:item.cardId,customerId:id,expectedStoreId:storeId,dataScope});
  }
  if(result.next&&nextBooking.generation()===nextGeneration)nextBooking.seed(result.next,id,0,{mode:'upcoming'});
  if(result.musicOverview&&overview.generation()===overviewGeneration)overview.seed(result.musicOverview,id,false);
  if(result.phone&&phone.generation()===phoneGeneration)phone.seed(result.phone,id);
  if(result.makeups&&makeups.generation()===makeupsGeneration)makeups.seed(result.makeups,id,dataScope??'operational');
  for(const item of result.beautyProgress??[])seedCardProgress?.(id,item.cardId,revision,item.result);
 },[primaryInput,primary,cards,progress,nextBooking,overview,dataScope,storeId,seedCardProgress,revision,phone,makeups,readOverview]);
 const args=useCallback((customerId:string,history=false)=>({customerId,dataScope,search:'',history,page:0}),[dataScope]);
 const readPlans=useCallback(async(id:string,history=false,complete=true)=>{
  if(!canReadCards)return;
  const result=await cards.read(args(id,history));
  if(!result.success)return;
  // Read the same complete detail used by the click destination, not just list rows.
  const completeDetails=async()=>{for(let offset=0;complete&&(!load||preloadCardDetails)&&offset<Math.min(result.rows.length,20);offset+=2)await Promise.allSettled(result.rows.slice(offset,Math.min(offset+2,20)).map(card=>details.read({cardId:card.id,dataScope})));};
  const detailTask=completeDetails();
  if(!canPreloadProgress&&!(preloadCardProgress&&canReadBookings)){await detailTask;return;}
  // Match the displayed first page, including historical plans.
  const targets=result.rows.filter(card=>card.unit==='SESSION'||canReadTransactions).slice(0,20);
  for(let offset=0;offset<targets.length;offset+=2)await Promise.allSettled(targets.slice(offset,offset+2).map(card=>preloadCardProgress?preloadCardProgress(id,card.id,revision):progress.read({cardId:card.id,customerId:id,expectedStoreId:storeId,dataScope})));
  await detailTask;
 },[canReadCards,cards,args,canPreloadProgress,preloadCardProgress,canReadBookings,canReadTransactions,revision,progress,storeId,dataScope,details,load,preloadCardDetails]);
 const getPlans=useCallback((id:string,history=false,complete=true):boolean=>{
  if(!canReadCards)return true;
  const loaded=cards.get(args(id,history));
  return !!(loaded?.success&&(!complete||!!load&&!preloadCardDetails||loaded.rows.slice(0,20).every(card=>details.get({cardId:card.id,dataScope})))&&(!canReadBookings||!(canPreloadProgress||getCardProgress)||loaded.rows.filter(card=>card.unit==='SESSION'||canReadTransactions).slice(0,20).every(card=>getCardProgress?getCardProgress(id,card.id,revision):progress.get({cardId:card.id,customerId:id,expectedStoreId:storeId,dataScope}))));
 },[canReadCards,cards,args,canReadBookings,canPreloadProgress,getCardProgress,canReadTransactions,revision,progress,storeId,dataScope,details,load,preloadCardDetails]);
 const read=useCallback(async(id:string)=>{
  await Promise.allSettled([
   readPlans(id),readSupport(id),
   ...(!music&&(!load||!!bookings&&preloadCardDetails)&&canReadBookings?[nextBooking.read(id,0,{mode:'upcoming'})]:[]),
   ...(music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?[periods.read(id),overview.read(id,false)]:[]),
   ...(music&&dataScope!=='legacy'&&canReadTransactions?[orders.read(id,0)]:[]),
  ]);
 },[readPlans,canReadCards,canReadBookings,canReadTransactions,music,dataScope,periods,overview,orders,load,nextBooking,readSupport,bookings,preloadCardDetails]);
 const get=useCallback((id:string):boolean=>{
  return Boolean(getPlans(id)&&getSupport(id)&&(!music&&(!load||!!bookings&&preloadCardDetails)&&canReadBookings?nextBooking.get(id,0,{mode:'upcoming'}):true)&&
   (!music||dataScope==='legacy'||!(canReadCards||canReadBookings)||periods.get(id)&&overview.get(id,false))&&
   (!music||dataScope==='legacy'||!canReadTransactions||orders.get(id,0)));
 },[getPlans,canReadCards,canReadBookings,canReadTransactions,music,dataScope,periods,overview,orders,load,nextBooking,getSupport,bookings,preloadCardDetails]);

 const reader=useMemo(()=>({read,get}),[read,get]);
 // The page scheduler waits only for primary data. Complete plan management stays lazy.
 const getVisible=useCallback((id:string)=>Boolean(getPlans(id,false,false)&&
  (music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?overview.get(id,false):!music&&(!load||!!bookings&&preloadCardDetails)&&canReadBookings?nextBooking.get(id,0,{mode:'upcoming'}):true)),[getPlans,music,dataScope,canReadCards,canReadBookings,overview,load,bookings,preloadCardDetails,nextBooking]);
 const readVisible=useCallback(async(id:string,foreground=true)=>{
  if(getVisible(id))return;
  const key=JSON.stringify(['customer-primary',!!load,primaryInput(id),revision]);
  return queue.read(key,async()=>{
   if(aggregate)await readPrimary(id);
   else await Promise.all([readPlans(id,false,false),...(!music&&(!load||!!bookings&&preloadCardDetails)&&canReadBookings?[nextBooking.read(id,0,{mode:'upcoming'})]:[]),...(music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?[overview.read(id,false)]:[])]);
  },foreground);
 },[getVisible,queue,load,primaryInput,revision,aggregate,readPrimary,readPlans,music,bookings,preloadCardDetails,canReadBookings,nextBooking,dataScope,canReadCards,overview]);
 const visibleReader=useMemo(()=>({read:(id:string)=>readVisible(id,true),get:getVisible}),[readVisible,getVisible]);
 const backgroundReader=useMemo(()=>({read:(id:string)=>readVisible(id,false),get:getVisible,cancel:(id:string)=>queue.cancel(JSON.stringify(['customer-primary',!!load,primaryInput(id),revision]))}),[readVisible,getVisible,queue,load,primaryInput,revision]);
 const prefetch=useCallback((id:string)=>{if(id&&!getVisible(id))void readVisible(id,true).catch(()=>{});},[getVisible,readVisible]);
 return {reader,visibleReader,backgroundReader,prefetch};
}
