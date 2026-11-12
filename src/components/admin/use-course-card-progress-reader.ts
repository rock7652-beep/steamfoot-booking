"use client";
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {readCourseCardProgress} from '@/lib/course-card-read-client';
import {CUSTOMER_PLAN_PRELOAD_TTL} from './customer-plan-read-policy';
/** Short-lived display data only; transactions still perform authoritative checks. */
export function useCourseCardProgressReader(storeId:string,revision=0){
 return usePanelReader('course-card-progress',readCourseCardProgress,JSON.stringify([storeId,revision]),CUSTOMER_PLAN_PRELOAD_TTL,400);
}
