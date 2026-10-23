import {expect,it} from 'vitest';
import {beautyNativeCalendarRange} from '@/lib/beauty/calendar';
import {beautyNativeCalendar} from '@/lib/beauty/native-calendar';
import {toLocalDateStr} from '@/lib/date-utils';
import type {BeautyCalendarData} from '@/lib/beauty/calendar-read';
it.each([['2026-10-22','2026-09-25','2026-11-06'],['2028-02-10','2028-01-26','2028-03-06']])('covers the same native padded month for %s', (date,start,end)=>{
 const range=beautyNativeCalendarRange(date);expect(toLocalDateStr(range.start)).toBe(start);expect(toLocalDateStr(range.end)).toBe(end);
});
it('projects cancelled, completed and trial services plus rentals without faking recurring sessions or changing true service duration',()=>{
 const base={id:'item',serviceId:'service',serviceName:'服務',personName:'顧客',customerId:'customer',technicianId:'tech',locationId:'room',cardId:'card',status:'COMPLETED',isTrial:false,startsAt:'2026-10-28T03:30:00.000Z',endsAt:'2026-10-28T04:30:00.000Z',occupiedEndsAt:'2026-10-28T04:45:00.000Z',buffer:15,notes:''};
 const data={date:'2026-10-28',calendar:'month',calendarDays:{},items:[base,{...base,id:'trial',status:'RESERVED',isTrial:true,cardId:null},{...base,id:'cancelled',status:'CANCELLED'}],rentals:[{id:'rent',customerName:'租借',roomId:'room',startsAt:base.startsAt,endsAt:base.endsAt,occupiedStartsAt:base.startsAt,occupiedEndsAt:base.occupiedEndsAt}]} as unknown as BeautyCalendarData;
 const value=beautyNativeCalendar(data,[],{customer:'manager'});
 expect(value.sessions.map(s=>s.id)).toEqual(['item','trial','rental:rent']);expect(value.cancelledBookings).toMatchObject([{id:'cancelled'}]);
 expect(value.sessions[0]).toMatchObject({endsAt:base.endsAt,occupiedEndsAt:base.occupiedEndsAt,bookings:[{assignedCoachId:'manager',status:'ATTENDED'}]});
 expect(value.sessions[1].bookings[0].bookingKind).toBe('TRIAL');expect(value.sessions[2].rentalId).toBe('rent');expect(value.sessions.every(s=>!s.isFixed)).toBe(true);
});
