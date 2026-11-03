import {expect,it} from 'vitest';
import {beautyScheduleRange} from '@/lib/beauty/calendar';
import {toLocalDateStr} from '@/lib/date-utils';
it.each(['2026-10-19','2026-10-22','2026-10-25'])('queries the entire displayed week when selected date is %s',date=>{const r=beautyScheduleRange(date,'week');expect(toLocalDateStr(r.start)).toBe('2026-10-19');expect(toLocalDateStr(r.end)).toBe('2026-10-25');});
it('does not lose the previous-year days of a week crossing midnight and New Year',()=>{const r=beautyScheduleRange('2027-01-01','week');expect(r.start.toISOString()).toBe('2026-12-27T16:00:00.000Z');expect(toLocalDateStr(r.end)).toBe('2027-01-03');});

import {beautyStaffAvailability} from '@/lib/beauty/calendar';
import {projectBeautyCalendar,type BeautyCalendarData} from '@/lib/beauty/calendar-read';
it('maps custom hours including closed weekdays and holiday overrides without changing inherited defaults',()=>{
 const r=beautyStaffAvailability([{id:'custom',weekly:[{day:4,start:'12:00',end:'18:00'}],exceptions:{'2026-10-22':[],'2026-10-23':[{start:'10:00',end:'12:00'}]}},{id:'inherited',weekly:{inheritStore:true},exceptions:{}}]);
 expect(r.staffAvailability).toHaveLength(7);
 expect(r.staffAvailability.find(p=>p.dayOfWeek===4)?.segments).toEqual([{openTime:'12:00',closeTime:'18:00'}]);
 expect(r.staffAvailability.find(p=>p.dayOfWeek===3)?.segments).toEqual([]);
 expect(r.staffAvailabilityExceptions).toEqual([{staffId:'custom',date:'2026-10-22',type:'UNAVAILABLE',segments:[],reason:null},{staffId:'custom',date:'2026-10-23',type:'CUSTOM',segments:[{openTime:'10:00',closeTime:'12:00'}],reason:null}]);
});
it('projects only complete covered ranges and preserves Taiwan midnight boundaries',()=>{
 const r=beautyScheduleRange('2026-10-22','day');
 const source={date:'2026-10-22',calendar:'day',calendarDays:{'2026-10-22':{}},items:[{id:'before',startsAt:'2026-10-21T15:59:59Z'},{id:'first',startsAt:r.start.toISOString()},{id:'last',startsAt:r.end.toISOString()},{id:'after',startsAt:'2026-10-22T16:00:00Z'}]} as unknown as BeautyCalendarData;
 expect(projectBeautyCalendar(source,'2026-10-22','day')?.items.map(b=>b.id)).toEqual(['first','last']);
 expect(projectBeautyCalendar(source,'2026-10-22','week')).toBeNull();
 expect(projectBeautyCalendar(source,'2026-10-23','day')).toBeNull();
});
