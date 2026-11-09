"use client";
import {useCallback,useMemo} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import type {browseCourseCards} from '@/server/actions/course-browse';
import {readMusicPeriods} from '@/lib/music-period-read-client';
import {loadMusicStudentWorkspace} from '@/server/actions/music-student-workspace';
import {loadCourseCustomerPurchases} from '@/server/actions/course-customer-history';

import {useCustomerCardReader,CUSTOMER_PLAN_PRELOAD_TTL} from './use-customer-card-reader';
export {useCustomerCardReader} from './use-customer-card-reader';
type PlanPreload={reader:{read:(id:string)=>Promise<void>;get:(id:string)=>boolean};prefetch:(id:string)=>void};
export function useCustomerPlanPreload({load,native=false,music=false,canReadCards,canReadBookings=false,canReadTransactions=false,revision=0,dataScope}: {
 load?:typeof browseCourseCards;native?:boolean;music?:boolean;canReadCards:boolean;canReadBookings?:boolean;canReadTransactions?:boolean;revision?:number;dataScope?:'operational'|'legacy';
}):PlanPreload{
 const cards=useCustomerCardReader({load,native,revision});
 const periods=usePanelReader('music-periods',readMusicPeriods,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const overview=usePanelReader('music-student-workspace',loadMusicStudentWorkspace,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const orders=usePanelReader('purchases',loadCourseCustomerPurchases,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const args=useCallback((customerId:string)=>({customerId,dataScope,search:'',history:false,page:0}),[dataScope]);
 const read=useCallback(async(id:string)=>{
  await Promise.allSettled([
   ...(canReadCards?[cards.read(args(id))]:[]),
   ...(music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?[periods.read(id),overview.read(id,false)]:[]),
   ...(music&&dataScope!=='legacy'&&canReadTransactions?[orders.read(id,0)]:[]),
  ]);
 },[canReadCards,canReadBookings,canReadTransactions,music,dataScope,cards,periods,overview,orders,args]);
 const get=useCallback((id:string):boolean=>Boolean(
  (!canReadCards||cards.get(args(id)))&&
  (!music||dataScope==='legacy'||!(canReadCards||canReadBookings)||periods.get(id)&&overview.get(id,false))&&
  (!music||dataScope==='legacy'||!canReadTransactions||orders.get(id,0))
 ),[canReadCards,canReadBookings,canReadTransactions,music,dataScope,cards,periods,overview,orders,args]);
 const reader=useMemo(()=>({read,get}),[read,get]);
 const prefetch=useCallback((id:string)=>{if(id&&!get(id))void read(id);},[get,read]);
 return {reader,prefetch};
}
