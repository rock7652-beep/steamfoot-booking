"use client";
import {usePanelReader} from '@/components/operations/panel-read-cache';
import type {getCustomerPanelContext} from '@/server/actions/customer-panel-context';
const dateKeys=new Set(["createdAt","updatedAt","birthday","expiryDate","startDate","bookingDate","entryDate","sortAt","lineLinkedAt","lineBindingCodeCreatedAt"]);
function restoreDates(value:unknown):unknown{
 if(Array.isArray(value))return value.map(restoreDates);
 if(!value||typeof value!=="object"||value instanceof Date)return value;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,dateKeys.has(key)&&typeof item==="string"?new Date(item):restoreDates(item)]));
}
export const readCustomerContext:typeof getCustomerPanelContext=async id=>{
 const prefix=window.location.pathname.split('/dashboard')[0];
 const response=await fetch(`${prefix}/dashboard/customers/panel-read?customerId=${encodeURIComponent(id)}`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw Error('顧客資料讀取失敗，請重試');
 const result=await response.json();
 if(result.success){
  result.data.customer=restoreDates(result.data.customer);
  if(result.data.customer.recentConsumption)result.data.customer.recentConsumption=result.data.customer.recentConsumption.map((row:{date:string})=>({...row,date:new Date(row.date)}));
 }
 return result;
};
export function useCustomerPanelContextReader(scope=''){
 return usePanelReader('steamfoot-customer-context',readCustomerContext,scope,15_000,30);
}
