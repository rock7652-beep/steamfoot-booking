"use client";
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {readBeautyNativeCardProgress} from '@/lib/beauty/customer-reader';
import {CUSTOMER_PLAN_PRELOAD_TTL} from '@/components/admin/use-customer-card-reader';
/** The preload and the visible grid share both in-flight reads and scoped results. */
const readProgress=(storeId:string,customerId:string,cardId:string,revision:number)=>{void revision;return readBeautyNativeCardProgress(storeId,customerId,cardId);};
export function useBeautyNativePlanProgressReader(storeId:string){
 return usePanelReader('beauty-card-progress',readProgress,storeId,CUSTOMER_PLAN_PRELOAD_TTL,400);
}
