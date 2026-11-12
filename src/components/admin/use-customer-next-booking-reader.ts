"use client";
import {usePanelReader,useMusicDataRevision} from '@/components/operations/panel-read-cache';
import {CUSTOMER_PLAN_PRELOAD_TTL} from './customer-plan-read-policy';
import type {loadCourseCustomerBookings} from '@/server/actions/course-members';
import type {CustomerBookingHistoryReader} from '@/app/(dashboard)/dashboard/courses/customer-bookings';
const readNextBooking:typeof loadCourseCustomerBookings=(...args)=>import('@/server/actions/course-members').then(module=>module.loadCourseCustomerBookings(...args));
/** Short-lived display data; booking writes retain their authoritative checks. */
export function useCustomerNextBookingReader(revision=0,load:CustomerBookingHistoryReader=readNextBooking,serviceMode=false,storeId='',preloadSource=false){
 const syncRevision=useMusicDataRevision();
 return usePanelReader(serviceMode?'module-customer-next':'course-customer-next',load,JSON.stringify([revision,syncRevision,storeId]),serviceMode&&!preloadSource?0:CUSTOMER_PLAN_PRELOAD_TTL);
}
