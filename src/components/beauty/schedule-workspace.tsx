"use client";
import {useBeautyCustomerRevision} from "./use-customer-sync";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {useCallback,useEffect,useMemo,useState,useRef,type ReactNode} from 'react';
import {LoadingStatus} from "@/components/loading-status";
import {useSportsCalendarState,calendarDate,calendarMode} from "@/components/admin/use-sports-calendar-state";
import {CourseWorkspace,type CourseCalendarSource} from '@/app/(dashboard)/dashboard/courses/workspace';
import {beautyNativeCalendar,readBeautyNativeCalendar} from '@/lib/beauty/native-calendar';
import {beautyStaffAvailability} from '@/lib/beauty/calendar';
import {orderCourseRows} from '@/lib/course-display-order';
import {toLocalDateStr} from '@/lib/date-utils';
import {beautyNativeScheduleSource} from './native-schedule-source';
import type {BeautyCalendarData} from '@/lib/beauty/calendar-read';
import type {BeautyDashboardData} from '@/server/beauty/queries';

/** Only data and authorized core ports; the original workspace owns calendar state and UI. */
export function BeautyScheduleWorkspace({suspended=false,cashbookShortcut,data,slug,onOpen,onRoster,onDateChange,readOnly,onLoaded,move}:{suspended?:boolean;move?:CourseCalendarSource["move"];cashbookShortcut?:ReactNode;onLoaded:(data:BeautyCalendarData)=>void;data:BeautyDashboardData;slug:string;onOpen:(id:string)=>void;onRoster:()=>void;onDateChange:(date:string)=>void;readOnly:boolean}){
 // Prime the existing scope-owned calendar state before mounting its UI after a full navigation.
 useSportsCalendarState(true,'mode','month',calendarMode);
 const [,setNativeDate]=useSportsCalendarState(true,'date',data.date,calendarDate);
 const sourceDate=useRef(data.date);
 useEffect(()=>{if(sourceDate.current!==data.date){sourceDate.current=data.date;setNativeDate(data.date);}},[data.date,setNativeDate]);
 const [hydrated,setHydrated]=useState(false);
 // Retained state restores in passive subscriptions. Hydration alone can finish before
 // those subscriptions, briefly mounting the original controller with its month default.
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)setHydrated(true);});return()=>{active=false;};},[]);
 const assigned=useMemo(()=>Object.fromEntries(data.customers.map(c=>[c.id,c.assignedStaff?.id??null])),[data.customers]);
 const customerRevision=useBeautyCustomerRevision(suspended);
 const calendarReader=usePanelReader('beauty-calendar-native',readBeautyNativeCalendar,JSON.stringify([data.storeId,customerRevision]),0);
 const initial=beautyNativeCalendar(data,data.techs,assigned);
 const read=useCallback<CourseCalendarSource['read']>(async date=>{
  const result=await calendarReader.read(date,slug);
  if(result.success)return {success:true,data:beautyNativeCalendar(result.data,data.techs,assigned),onAccepted:()=>onLoaded(result.data)};return result;
 },[calendarReader,slug,data.techs,assigned,onLoaded]);
 const native=beautyNativeScheduleSource(data);
 const snapshotVersion=JSON.stringify([data.date,data.access.customerAccess,assigned,data.items.map(b=>[b.id,b.revision,b.paymentStatus,b.personName,b.personPhone]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),(data.rentals??[]).map(r=>[r.id,r.startsAt,r.endsAt,r.customerId,r.customerName,r.customerPhone])]);
 const calendarSource=useMemo<CourseCalendarSource>(()=>({detailOpen:suspended,readBlocked:suspended,snapshotVersion,read,move,schedule:native.source,onOpen,onRoster,onDateChange,assignmentStaff:data.assignmentStaff.map(p=>({id:p.id,name:p.displayName}))}),[suspended,snapshotVersion,read,move,native.source,onOpen,onRoster,onDateChange,data.assignmentStaff]);
 if(!hydrated)return <div data-beauty-loading><LoadingStatus>讀取班表中…</LoadingStatus></div>;
 return <CourseWorkspace cashbookShortcut={cashbookShortcut} calendarSource={calendarSource} sportsNative sportsData={native.initial} view="schedule" businessProfile="FITNESS" storeId={data.storeId} selectedDate={data.date} today={toLocalDateStr()} nowIso={new Date(data.now).toISOString()} calendarDays={initial.calendarDays} rooms={orderCourseRows(data.locations,data.displayOrders?.room?.ids??[])} templates={orderCourseRows(data.services,data.displayOrders?.subject?.ids??[]).map(s=>({...s,isActive:s.active,durationMinutes:s.duration,bufferMinutes:s.buffer,capacity:1,pointCost:1,defaultRoomId:null,classType:'PRIVATE'}))} sessions={initial.sessions} cancelledBookings={initial.cancelledBookings} coaches={orderCourseRows(data.techs,data.displayOrders?.staff?.ids??[]).map(t=>({id:t.id,displayName:t.name,phone:t.phone,status:t.active?'ACTIVE':'INACTIVE',courseCoachEnabled:t.active,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:t.serviceIds}))} {...beautyStaffAvailability(data.techs)} canCreate={!readOnly&&data.access.writeAccess} canEdit={!readOnly&&data.manage.update} />;
}
