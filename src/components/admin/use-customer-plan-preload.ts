"use client";
import {useCallback,useMemo} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
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
type ReadinessReader={read:(id:string)=>Promise<void>;get:(id:string)=>boolean};
type PlanPreload={reader:ReadinessReader;visibleReader:ReadinessReader;prefetch:(id:string)=>void};
const readStudentWorkspace:typeof loadMusicStudentWorkspace=readCustomerOverview;
const readCustomerPurchases:typeof loadCourseCustomerPurchases=(...args)=>import('@/server/actions/course-customer-history').then(module=>module.loadCourseCustomerPurchases(...args));
export function useCustomerPlanPreload({load,support,bookings,preloadOverview=false,preloadCardDetails=false,preloadCardProgress,getCardProgress,native=false,music=false,canReadCards,canReadBookings=false,canReadTransactions=false,revision=0,dataScope,storeId=''}: {
 preloadOverview?:boolean;bookings?:CourseCustomerSource['bookings'];support?:CourseCustomerSource['support'];preloadCardDetails?:boolean;getCardProgress?:(customerId:string,cardId:string,revision:number)=>unknown;preloadCardProgress?:(customerId:string,cardId:string,revision:number)=>Promise<unknown>;load?:typeof browseCourseCards;native?:boolean;music?:boolean;canReadCards:boolean;canReadBookings?:boolean;canReadTransactions?:boolean;revision?:number;dataScope?:'operational'|'legacy';storeId?:string;
}):PlanPreload{
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
 const args=useCallback((customerId:string,history=false)=>({customerId,dataScope,search:'',history,page:0}),[dataScope]);
 const readPlans=useCallback(async(id:string,history=false)=>{
  if(!canReadCards)return;
  const result=await cards.read(args(id,history));
  if(!result.success)return;
  // Read the same complete detail used by the click destination, not just list rows.
  const completeDetails=async()=>{for(let offset=0;(!load||preloadCardDetails)&&offset<Math.min(result.rows.length,20);offset+=2)await Promise.allSettled(result.rows.slice(offset,Math.min(offset+2,20)).map(card=>details.read({cardId:card.id,dataScope})));};
  const detailTask=completeDetails();
  if(!canPreloadProgress&&!(preloadCardProgress&&canReadBookings)){await detailTask;return;}
  // Match the displayed first page, including historical plans.
  const targets=result.rows.filter(card=>card.unit==='SESSION'||canReadTransactions).slice(0,20);
  for(let offset=0;offset<targets.length;offset+=2)await Promise.allSettled(targets.slice(offset,offset+2).map(card=>preloadCardProgress?preloadCardProgress(id,card.id,revision):progress.read({cardId:card.id,customerId:id,expectedStoreId:storeId,dataScope})));
  await detailTask;
 },[canReadCards,cards,args,canPreloadProgress,preloadCardProgress,canReadBookings,canReadTransactions,revision,progress,storeId,dataScope,details,load,preloadCardDetails]);
 const getPlans=useCallback((id:string,history=false):boolean=>{
  if(!canReadCards)return true;
  const loaded=cards.get(args(id,history));
  return !!(loaded?.success&&(!!load&&!preloadCardDetails||loaded.rows.slice(0,20).every(card=>details.get({cardId:card.id,dataScope})))&&(!canReadBookings||!(canPreloadProgress||getCardProgress)||loaded.rows.filter(card=>card.unit==='SESSION'||canReadTransactions).slice(0,20).every(card=>getCardProgress?getCardProgress(id,card.id,revision):progress.get({cardId:card.id,customerId:id,expectedStoreId:storeId,dataScope}))));
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
 // Only the overview blocks: collapsed history, periods and payment tabs stay lazy.
 const visibleReader=useMemo(()=>({read:async(id:string)=>{
  await Promise.allSettled([readPlans(id),readSupport(id),...(music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?[overview.read(id,false)]:!music&&(!load||!!bookings&&preloadCardDetails)&&canReadBookings?[nextBooking.read(id,0,{mode:'upcoming'})]:[])]);
 },get:(id:string)=>Boolean(getPlans(id)&&getSupport(id)&&
  (music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?overview.get(id,false):!music&&(!load||!!bookings&&preloadCardDetails)&&canReadBookings?nextBooking.get(id,0,{mode:'upcoming'}):true))}),[readPlans,getPlans,music,dataScope,canReadCards,canReadBookings,load,overview,nextBooking,readSupport,getSupport,bookings,preloadCardDetails]);
 const prefetch=useCallback((id:string)=>{if(id&&!get(id))void read(id);},[get,read]);
 return {reader,visibleReader,prefetch};
}
