"use client";
import {createContext,useCallback,useContext,useLayoutEffect,useMemo,useState,type ReactNode} from "react";
import {usePathname,useSearchParams,useRouter} from "next/navigation";
import {DashboardLink,resolveDashboardHref} from "@/components/dashboard-link";
import {CUSTOMER_MESSAGE_LIMIT} from "@/lib/customer-message";
import {messageSelectionKey} from "@/lib/customer-message-selection";

const button="inline-flex min-h-11 items-center justify-center rounded-lg border border-earth-200 px-3 py-2 text-sm font-medium text-primary-700";
const Selection=createContext<{storeId:string;enabled:boolean;ids:string[];scope:string;set:(ids:string[],scope:string)=>void}|null>(null);
export function customerMessageSelectionScope(pathname:string,query:string){
  const params=new URLSearchParams(query);params.delete("customerId");params.delete("drawerFocus");
  return pathname+"?"+params.toString();
}
export function CustomerMessageSelectionProvider({storeId,enabled,children}:{storeId:string;enabled:boolean;children:ReactNode}){
  const [selection,setSelection]=useState<{ids:string[];scope:string}>({ids:[],scope:""});
  const set=useCallback((ids:string[],scope:string)=>setSelection(old=>old.scope===scope&&old.ids.join("\0")===ids.join("\0")?old:{ids,scope}),[]);
  const value=useMemo(()=>({storeId,enabled,...selection,set}),[storeId,enabled,selection,set]);
  return <Selection.Provider value={value}>{children}</Selection.Provider>;
}
export function useCustomerMessageSelection(ids:Set<string>){
  const context=useContext(Selection),pathname=usePathname(),query=useSearchParams();
  const scope=customerMessageSelectionScope(pathname,query.toString()),set=context?.set;
  useLayoutEffect(()=>{set?.([...ids],scope);},[ids,scope,set]);
  return context?.enabled??false;
}
export function CustomerMessageActions(){
  const context=useContext(Selection),pathname=usePathname(),query=useSearchParams();
  const router=useRouter();
  const [error,setError]=useState("");
  if(!context?.enabled)return null;
  const ids=context.scope===customerMessageSelectionScope(pathname,query.toString())?context.ids:[];
  return <div className="flex flex-wrap items-center justify-end gap-2">
    <DashboardLink href="/dashboard/customers/messages?view=history" prefetch={false} className={button}>發送紀錄</DashboardLink>
    <DashboardLink href="/dashboard/customers/messages" prefetch={false} className={`${button} !border-primary-700 bg-primary-700 !text-white hover:bg-primary-800`} onClick={event=>{
      if(!ids.length)return;
      if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey){event.preventDefault();setError("請直接點擊，將勾選顧客帶入目前分頁");return;}
      if(ids.length>CUSTOMER_MESSAGE_LIMIT){event.preventDefault();setError(`每次最多 ${CUSTOMER_MESSAGE_LIMIT} 位，請減少勾選顧客`);return;}
      try{
        const token=crypto.randomUUID();
        sessionStorage.setItem(messageSelectionKey(token),JSON.stringify({storeId:context.storeId,customerIds:ids,createdAt:Date.now()}));
        // Only a random reference travels in the URL; customer IDs stay in this tab.
        event.preventDefault();
        router.push(resolveDashboardHref(`/dashboard/customers/messages?selection=${token}`,pathname));
      }catch{event.preventDefault();setError("無法帶入勾選顧客，請允許瀏覽器儲存後重試");}
    }}>發送訊息{ids.length>0?`（${ids.length}）`:""}</DashboardLink>
    {error&&<p role="alert" className="basis-full text-right text-sm text-red-700">{error}</p>}
  </div>;
}
export function CustomerMessageSingleLink({customerId,enabled,onNavigate}:{customerId:string;enabled?:boolean;onNavigate?:()=>boolean}){
  const context=useContext(Selection);
  if(!(enabled??context?.enabled))return null;
  return <DashboardLink href={`/dashboard/customers/messages?customerId=${encodeURIComponent(customerId)}`} prefetch={false} className={button} onClick={event=>{if(onNavigate&&!onNavigate())event.preventDefault();}}>發送 LINE</DashboardLink>;
}
