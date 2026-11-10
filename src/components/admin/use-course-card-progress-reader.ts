"use client";
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {loadCourseCardProgress} from '@/server/actions/course-card-progress';
import {CUSTOMER_PLAN_PRELOAD_TTL} from './use-customer-card-reader';
/** Short-lived display data only; transactions still perform authoritative checks. */
export function useCourseCardProgressReader(storeId:string,revision=0){
 return usePanelReader('course-card-progress',loadCourseCardProgress,JSON.stringify([storeId,revision]),CUSTOMER_PLAN_PRELOAD_TTL);
}
