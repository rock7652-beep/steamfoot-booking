"use client";
import {useCallback,useMemo} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import type {browseCourseCards} from '@/server/actions/course-browse';
import {readMusicPeriods} from '@/lib/music-period-read-client';
import type {loadMusicStudentWorkspace} from '@/server/actions/music-student-workspace';
import type {loadCourseCustomerPurchases} from '@/server/actions/course-customer-history';

import {useCustomerNextBookingReader} from './use-customer-next-booking-reader';
import {useCourseCardProgressReader} from './use-course-card-progress-reader';
import {useCustomerCardReader,CUSTOMER_PLAN_PRELOAD_TTL} from './use-customer-card-reader';
export {useCustomerCardReader} from './use-customer-card-reader';
type ReadinessReader={read:(id:string)=>Promise<void>;get:(id:string)=>boolean};
type PlanPreload={reader:ReadinessReader;visibleReader:ReadinessReader;prefetch:(id:string)=>void};
const readStudentWorkspace:typeof loadMusicStudentWorkspace=(...args)=>import('@/server/actions/music-student-workspace').then(module=>module.loadMusicStudentWorkspace(...args));
const readCustomerPurchases:typeof loadCourseCustomerPurchases=(...args)=>import('@/server/actions/course-customer-history').then(module=>module.loadCourseCustomerPurchases(...args));
export function useCustomerPlanPreload({load,preloadCardProgress,getCardProgress,native=false,music=false,canReadCards,canReadBookings=false,canReadTransactions=false,revision=0,dataScope,storeId=''}: {
 getCardProgress?:(customerId:string,cardId:string,revision:number)=>unknown;preloadCardProgress?:(customerId:string,cardId:string,revision:number)=>Promise<unknown>;load?:typeof browseCourseCards;native?:boolean;music?:boolean;canReadCards:boolean;canReadBookings?:boolean;canReadTransactions?:boolean;revision?:number;dataScope?:'operational'|'legacy';storeId?:string;
}):PlanPreload{
 const cards=useCustomerCardReader({load,native,revision,storeId,canReadBookings});
 const progress=useCourseCardProgressReader(storeId,revision);
 const nextBooking=useCustomerNextBookingReader(revision);
 const canPreloadProgress=!!storeId&&!load&&canReadCards&&canReadBookings;
 const periods=usePanelReader('music-periods',readMusicPeriods,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const overview=usePanelReader('music-student-workspace',readStudentWorkspace,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const orders=usePanelReader('purchases',readCustomerPurchases,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const args=useCallback((customerId:string,history=false)=>({customerId,dataScope,search:'',history,page:0}),[dataScope]);
 const readPlans=useCallback(async(id:string,history=false)=>{
  if(!canReadCards)return;
  const result=await cards.read(args(id,history));
  if((!canPreloadProgress&&!(preloadCardProgress&&canReadBookings))||!result.success)return;
  // Match the displayed first page, including historical plans.
  const targets=result.rows.filter(card=>card.unit==='SESSION'||canReadTransactions).slice(0,20);
  for(let offset=0;offset<targets.length;offset+=2)await Promise.allSettled(targets.slice(offset,offset+2).map(card=>preloadCardProgress?preloadCardProgress(id,card.id,revision):progress.read({cardId:card.id,customerId:id,expectedStoreId:storeId,dataScope})));
 },[canReadCards,cards,args,canPreloadProgress,preloadCardProgress,canReadBookings,canReadTransactions,revision,progress,storeId,dataScope]);
 const getPlans=useCallback((id:string,history=false):boolean=>{
  if(!canReadCards)return true;
  const loaded=cards.get(args(id,history));
  return !!(loaded?.success&&(!canReadBookings||!(canPreloadProgress||getCardProgress)||loaded.rows.filter(card=>card.unit==='SESSION'||canReadTransactions).slice(0,20).every(card=>getCardProgress?getCardProgress(id,card.id,revision):progress.get({cardId:card.id,customerId:id,expectedStoreId:storeId,dataScope}))));
 },[canReadCards,cards,args,canReadBookings,canPreloadProgress,getCardProgress,canReadTransactions,revision,progress,storeId,dataScope]);
 const read=useCallback(async(id:string)=>{
  await Promise.allSettled([
   readPlans(id),
   ...(!music&&!load&&canReadBookings?[nextBooking.read(id,0,{mode:'upcoming'})]:[]),
   ...(music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?[periods.read(id),overview.read(id,false)]:[]),
   ...(music&&dataScope!=='legacy'&&canReadTransactions?[orders.read(id,0)]:[]),
  ]);
 },[readPlans,canReadCards,canReadBookings,canReadTransactions,music,dataScope,periods,overview,orders,load,nextBooking]);
 const get=useCallback((id:string):boolean=>{
  return Boolean(getPlans(id)&&(!music&&!load&&canReadBookings?nextBooking.get(id,0,{mode:'upcoming'}):true)&&
   (!music||dataScope==='legacy'||!(canReadCards||canReadBookings)||periods.get(id)&&overview.get(id,false))&&
   (!music||dataScope==='legacy'||!canReadTransactions||orders.get(id,0)));
 },[getPlans,canReadCards,canReadBookings,canReadTransactions,music,dataScope,periods,overview,orders,load,nextBooking]);

 const reader=useMemo(()=>({read,get}),[read,get]);
 // Only the overview blocks: collapsed history, periods and payment tabs stay lazy.
 const visibleReader=useMemo(()=>({read:async(id:string)=>{
  await Promise.allSettled([readPlans(id),...(music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?[overview.read(id,false)]:!music&&!load&&canReadBookings?[nextBooking.read(id,0,{mode:'upcoming'})]:[])]);
 },get:(id:string)=>Boolean(getPlans(id)&&
  (music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?overview.get(id,false):!music&&!load&&canReadBookings?nextBooking.get(id,0,{mode:'upcoming'}):true))}),[readPlans,getPlans,music,dataScope,canReadCards,canReadBookings,load,overview,nextBooking]);
 const prefetch=useCallback((id:string)=>{if(id&&!get(id))void read(id);},[get,read]);
 return {reader,visibleReader,prefetch};
}
