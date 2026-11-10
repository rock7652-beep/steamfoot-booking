"use client";
import {useCallback,useMemo} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import type {browseCourseCards} from '@/server/actions/course-browse';
import {readMusicPeriods} from '@/lib/music-period-read-client';
import type {loadMusicStudentWorkspace} from '@/server/actions/music-student-workspace';
import type {loadCourseCustomerPurchases} from '@/server/actions/course-customer-history';

import {useCourseCardProgressReader} from './use-course-card-progress-reader';
import {useCustomerCardReader,CUSTOMER_PLAN_PRELOAD_TTL} from './use-customer-card-reader';
export {useCustomerCardReader} from './use-customer-card-reader';
type PlanPreload={reader:{read:(id:string)=>Promise<void>;get:(id:string)=>boolean};prefetch:(id:string)=>void};
const readStudentWorkspace:typeof loadMusicStudentWorkspace=(...args)=>import('@/server/actions/music-student-workspace').then(module=>module.loadMusicStudentWorkspace(...args));
const readCustomerPurchases:typeof loadCourseCustomerPurchases=(...args)=>import('@/server/actions/course-customer-history').then(module=>module.loadCourseCustomerPurchases(...args));
export function useCustomerPlanPreload({load,native=false,music=false,canReadCards,canReadBookings=false,canReadTransactions=false,revision=0,dataScope,storeId=''}: {
 load?:typeof browseCourseCards;native?:boolean;music?:boolean;canReadCards:boolean;canReadBookings?:boolean;canReadTransactions?:boolean;revision?:number;dataScope?:'operational'|'legacy';storeId?:string;
}):PlanPreload{
 const cards=useCustomerCardReader({load,native,revision});
 const progress=useCourseCardProgressReader(storeId,revision);
 const canPreloadProgress=!!storeId&&!load&&canReadCards&&canReadBookings;
 const periods=usePanelReader('music-periods',readMusicPeriods,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const overview=usePanelReader('music-student-workspace',readStudentWorkspace,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const orders=usePanelReader('purchases',readCustomerPurchases,String(revision),CUSTOMER_PLAN_PRELOAD_TTL);
 const args=useCallback((customerId:string)=>({customerId,dataScope,search:'',history:false,page:0}),[dataScope]);
 const read=useCallback(async(id:string)=>{
  await Promise.allSettled([
   ...(canReadCards?[cards.read(args(id)).then(async result=>{
    if(!canPreloadProgress||!result.success)return;
    // Bound speculative work per learner; other cards load when shown.
    const targets=result.rows.filter(card=>card.unit==='SESSION').slice(0,5);
    for(let offset=0;offset<targets.length;offset+=2)await Promise.allSettled(targets.slice(offset,offset+2).map(card=>progress.read({cardId:card.id,customerId:id,expectedStoreId:storeId,dataScope})));
   })]:[]),
   ...(music&&dataScope!=='legacy'&&(canReadCards||canReadBookings)?[periods.read(id),overview.read(id,false)]:[]),
   ...(music&&dataScope!=='legacy'&&canReadTransactions?[orders.read(id,0)]:[]),
  ]);
 },[canReadCards,canReadBookings,canReadTransactions,music,dataScope,cards,periods,overview,orders,args,canPreloadProgress,progress,storeId]);
 const get=useCallback((id:string):boolean=>Boolean(
  (!canReadCards||cards.get(args(id)))&&
  (!music||dataScope==='legacy'||!(canReadCards||canReadBookings)||periods.get(id)&&overview.get(id,false))&&
  (!music||dataScope==='legacy'||!canReadTransactions||orders.get(id,0))
 ),[canReadCards,canReadBookings,canReadTransactions,music,dataScope,cards,periods,overview,orders,args]);
 const reader=useMemo(()=>({read,get}),[read,get]);
 const prefetch=useCallback((id:string)=>{if(id&&!get(id))void read(id);},[get,read]);
 return {reader,prefetch};
}
