"use client";
import {usePanelReader} from '@/components/operations/panel-read-cache';
import type {loadCourseCardProgress} from '@/server/actions/course-card-progress';
import {CUSTOMER_PLAN_PRELOAD_TTL} from './use-customer-card-reader';
// Share the code import, never a user's result. Unused panels stay lazy, and
// concurrent card preloads do not evaluate the action module multiple times.
let actionModule:Promise<typeof import('@/server/actions/course-card-progress')>|undefined;
const readProgress:typeof loadCourseCardProgress=input=>{
 actionModule??=import('@/server/actions/course-card-progress').catch(error=>{actionModule=undefined;throw error;});
 return actionModule.then(module=>module.loadCourseCardProgress(input));
};
/** Short-lived display data only; transactions still perform authoritative checks. */
export function useCourseCardProgressReader(storeId:string,revision=0){
 return usePanelReader('course-card-progress',readProgress,JSON.stringify([storeId,revision]),CUSTOMER_PLAN_PRELOAD_TTL);
}
