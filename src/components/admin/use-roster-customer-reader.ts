"use client";
import {useCallback,useMemo} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import type {loadCourseRosterCustomer} from '@/server/actions/course-roster-customer';
import {CUSTOMER_PLAN_PRELOAD_TTL} from './customer-plan-read-policy';
async function readRosterCustomer(input:unknown):Promise<Awaited<ReturnType<typeof loadCourseRosterCustomer>>>{
 const prefix=window.location.pathname.split('/dashboard')[0];
 const response=await fetch(`${prefix}/dashboard/courses/roster-customer-read?args=${encodeURIComponent(JSON.stringify(input))}`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw Error('讀取失敗，請重試');
 return response.json();
}
export function useRosterCustomerReader(sessionId:string,storeId?:string,dataScope?:'operational'|'legacy',revision=''){
 const reader=usePanelReader('course-roster-customer',readRosterCustomer,JSON.stringify([storeId,sessionId,revision]),CUSTOMER_PLAN_PRELOAD_TTL,30);
 const args=useCallback((key:string)=>{const [customerId,cardId]=JSON.parse(key) as [string,string?];return {customerId,cardId:cardId??undefined,sessionId,expectedStoreId:storeId,dataScope};},[sessionId,storeId,dataScope]);
 return useMemo(()=>({read:(key:string)=>reader.read(args(key)),get:(key:string)=>reader.get(args(key)),prefetch:(key:string)=>reader.prefetch(args(key)),invalidate:(key:string)=>reader.invalidate(args(key)),clear:reader.clear}),[reader,args]);
}
