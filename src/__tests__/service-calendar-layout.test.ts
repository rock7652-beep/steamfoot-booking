import {it,expect} from 'vitest';
import {serviceTimelineBounds,serviceCustomerMatches} from '@/lib/service-calendar-layout';
it('fits opening hours and preserves out-of-hours occupations including cleanup',()=>{
 expect(serviceTimelineBounds([{openTime:'10:00',closeTime:'19:00'}],[])).toEqual({firstHour:10,endHour:19});
 expect(serviceTimelineBounds([{openTime:'10:00',closeTime:'19:00'}],[{startsAt:'2026-10-24T01:30:00Z',endsAt:'2026-10-24T11:00:00Z',occupiedEndsAt:'2026-10-24T11:15:00Z'}])).toEqual({firstHour:9,endHour:20});
 expect(serviceTimelineBounds([],[{startsAt:'2026-10-24T15:30:00Z',endsAt:'2026-10-24T16:00:00Z'}])).toEqual({firstHour:23,endHour:24});
});
it('uses customer names and partial formatted phones, while blank or redacted phones cannot match digits',()=>{
 const c={name:'林小美',phone:'0900123456'};
 expect(serviceCustomerMatches(c,'小美')).toBe(true);expect(serviceCustomerMatches(c,'0900-123')).toBe(true);expect(serviceCustomerMatches(c,'+886900123456')).toBe(true);expect(serviceCustomerMatches(c,'')).toBe(true);expect(serviceCustomerMatches(c,'做臉')).toBe(false);expect(serviceCustomerMatches({...c,phone:''},'0900')).toBe(false);expect(serviceCustomerMatches(c,'()')).toBe(false);
});
