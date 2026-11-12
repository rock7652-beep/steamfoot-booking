"use client";

import {useEffect,useState} from "react";
import {useMusicDataRevision} from "@/components/operations/panel-read-cache";
import {loadCourseCustomerBookings} from "@/server/actions/course-members";
import {useCustomerNextBookingReader} from '@/components/admin/use-customer-next-booking-reader';
import {formatTWDateTime} from "@/lib/date-utils";
import type {CustomerBookingHistoryReader} from "./customer-bookings";

/** Reuses the permission-checked booking reader; no guesses from the visible calendar. */
export function CustomerNextBooking({customerId,load=loadCourseCustomerBookings,serviceMode=false,revision=0,storeId="",preloadSource=false}:{
  customerId:string;load?:CustomerBookingHistoryReader;serviceMode?:boolean;revision?:number;storeId?:string;preloadSource?:boolean;
}) {
  const syncRevision=useMusicDataRevision();
  const reader=useCustomerNextBookingReader(revision,load,serviceMode,storeId,preloadSource);
  const [result,setResult]=useState<{key:string;value:Awaited<ReturnType<CustomerBookingHistoryReader>>}|null>(null);
  const [retry,setRetry]=useState(0);
  const key=JSON.stringify([customerId,revision,syncRevision,retry]);
  useEffect(()=>{
    let active=true;
    reader.read(customerId,0,{mode:"upcoming"}).then(value=>{if(active)setResult({key,value});})
      .catch(()=>{if(active)setResult({key,value:{success:false,error:"下次預約讀取失敗"}});});
    return()=>{active=false;};
  },[reader,customerId,key]);
  const value=result?.key===key?result.value:reader.peek(customerId,0,{mode:"upcoming"});
  return <section aria-label="下次預約" className="border-b border-earth-100 py-2 text-sm">
    {!value?<p role="status">讀取下次預約…</p>:!value.success?<p role="alert">{value.error}<button type="button" className="min-h-11 px-3 text-primary-700" onClick={()=>{reader.invalidate(customerId,0,{mode:"upcoming"});setRetry(n=>n+1);}}>重試</button></p>:value.data[0]?<p className="break-words"><span className="text-earth-500">下次預約 </span>{formatTWDateTime(new Date(value.data[0].date))} · {value.data[0].name}{value.data[0].coachName?` · ${value.data[0].coachName}`:""}</p>:<p className="text-earth-500">{serviceMode?"尚無下次服務預約":"尚未安排下次課程"}</p>}
  </section>;
}
