"use client";
import {usePanelReader} from '@/components/operations/panel-read-cache';
import type {browseCourseCards} from '@/server/actions/course-browse';
import {readNativeCourseCards} from '@/lib/course-card-read-client';
import {useCallback} from 'react';
import {useCourseCardProgressReader} from './use-course-card-progress-reader';
import {CUSTOMER_PLAN_PRELOAD_TTL} from './customer-plan-read-policy';
export {CUSTOMER_PLAN_PRELOAD_TTL} from './customer-plan-read-policy';
type CardArgs=Parameters<typeof browseCourseCards>;
type CardResult=Awaited<ReturnType<typeof browseCourseCards>>;
type CardReader=ReturnType<typeof usePanelReader<CardArgs,CardResult>>;
/** Lists are short-lived display data. Card detail and all writes retain authoritative reads. */
export function useCustomerCardReader({load,revision=0,storeId='',canReadBookings=false}:{load?:typeof browseCourseCards;native?:boolean;revision?:number;storeId?:string;canReadBookings?:boolean}):CardReader{
 const progress=useCourseCardProgressReader(storeId,revision);
 const read=useCallback(async(input:unknown)=>{
  const args=input as {customerId?:string;cardId?:string;dataScope?:'operational'|'legacy'};
  const bundled=!!storeId&&canReadBookings&&!!args.customerId&&!args.cardId;
  const generation=progress.generation();
  const result=await (bundled?readNativeCourseCards(input,storeId):readNativeCourseCards(input));
  // Install grids before publishing the card list, so opening it mounts complete rows.
  if(result.success&&bundled&&progress.generation()===generation)for(const item of result.progress??[]){
   progress.seed(item.result,{cardId:item.cardId,customerId:args.customerId!,expectedStoreId:storeId,dataScope:args.dataScope});
  }
  return result;
 },[storeId,canReadBookings,progress]);
 return usePanelReader(load?'module-card-browse':'course-card-browse',load??read,load?(storeId?JSON.stringify([revision,storeId]):String(revision)):JSON.stringify([revision,storeId,canReadBookings]),CUSTOMER_PLAN_PRELOAD_TTL);
}
