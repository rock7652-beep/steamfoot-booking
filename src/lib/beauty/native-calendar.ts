import type {CourseCalendarSnapshot,Session} from '@/app/(dashboard)/dashboard/courses/workspace';
import type {BeautyCalendarData} from './calendar-read';
import {beautyStaffAvailability} from './calendar';

/** Pure projection into the original native calendar controller's data contract. */
export function beautyNativeCalendar(data:BeautyCalendarData,technicians:Parameters<typeof beautyStaffAvailability>[0],assignedStaff:Record<string,string|null>={}):CourseCalendarSnapshot{
 const groups=[...new Set(data.items.filter(b=>b.status!=='CANCELLED').map(b=>b.groupId))];
 const groupInfo=(id:string)=>{const group=data.items.filter(b=>b.groupId===id&&b.status!=='CANCELLED');return group.length>1?{groupLabel:`同行 ${groups.indexOf(id)+1}`,groupProgress:`完成 ${group.filter(b=>b.status==='COMPLETED').length}/${group.length} 人`}:{};};
 const sessions:Session[]=data.items.filter(b=>b.status!=='CANCELLED').map(b=>({
  servicePalette:true,serviceCustomer:{name:b.personName,phone:b.personPhone??"",assignedStaffId:b.customerId?assignedStaff[b.customerId]??null:null},id:b.id,templateId:b.serviceId,nameSnapshot:b.serviceName,startsAt:b.startsAt,endsAt:b.endsAt,occupiedEndsAt:b.occupiedEndsAt,
  service:{...groupInfo(b.groupId),paymentStatus:b.paymentStatus,groupId:b.groupId,personName:b.personName,status:b.status,endsAt:b.endsAt,occupiedEndsAt:b.occupiedEndsAt,buffer:b.buffer},
  coachId:b.technicianId,roomId:b.locationId,capacity:1,pointCost:b.cardId?1:0,isTrial:b.isTrial,
  bookings:[{id:b.id,customerId:b.customerId,customerName:b.personName,assignedCoachId:b.customerId?assignedStaff[b.customerId]??null:null,status:b.status==='COMPLETED'?'ATTENDED':b.status,bookingKind:b.isTrial?'TRIAL':'REGULAR'}],
 }));
 sessions.push(...(data.rentals??[]).map(r=>({servicePalette:true,serviceCustomer:{name:r.customerName,phone:r.customerPhone??"",assignedStaffId:r.customerId?assignedStaff[r.customerId]??null:null},id:'rental:'+r.id,rentalId:r.id,templateId:'',nameSnapshot:r.customerName,startsAt:r.startsAt,endsAt:r.endsAt,occupiedStartsAt:r.occupiedStartsAt,occupiedEndsAt:r.occupiedEndsAt,coachId:'',roomId:r.roomId,capacity:0,pointCost:0,bookings:[],previewKind:'RENTAL' as const})));
 return {month:data.date.slice(0,7),sessions,calendarDays:data.calendarDays,
  cancelledBookings:data.items.filter(b=>b.status==='CANCELLED').map(b=>({id:b.id,sessionId:b.id,customerName:b.personName,absenceKind:null,notes:b.notes})),
  staffAvailabilityExceptions:beautyStaffAvailability(technicians).staffAvailabilityExceptions,
 };
}

export async function readBeautyNativeCalendar(date:string,slug:string):Promise<{success:true;data:BeautyCalendarData}|{success:false;error:string}>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch('/api/beauty/calendar?'+new URLSearchParams({date,calendar:'month',native:'1',store:slug}),{cache:'no-store',credentials:'same-origin',signal:controller.signal});
  const value=await r.json();
  if(!value||typeof value.success!=='boolean'||(!r.ok&&value.success))throw Error('課表讀取失敗');
  if(value.success&&(!value.data||value.data.date!==date||value.data.calendar!=='month'||!Array.isArray(value.data.items)))throw Error('班表日期已變更，請重新讀取');
  return value;
 }finally{clearTimeout(timer);}
}
