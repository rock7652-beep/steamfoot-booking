import {expect,it} from 'vitest';
import {studentScheduleHref,studentReturnHref} from '@/lib/music-student-navigation';
it('preserves the overview and list conditions when arranging a course from a customer profile',()=>{
 const next=new URL(studentScheduleHref('customer-a','studentTab=info&search=林&staff=owner&page=2&studentRecords=bookings'),'https://example.test');
 const back=new URLSearchParams(next.searchParams.get('returnStudentQuery')!);
 expect(back.get('customerId')).toBe('customer-a');expect(back.get('studentTab')).toBe('info');
 expect(back.get('search')).toBe('林');expect(back.get('page')).toBe('2');expect(back.get('staff')).toBe('owner');
 expect(next.searchParams.get('scheduleCustomer')).toBe('customer-a');
});
it('keeps existing specialist and records return tabs',()=>{
 for(const tab of ['courses','records'])expect(new URL(studentReturnHref('a','studentTab='+tab),'https://example.test').searchParams.get('studentTab')).toBe(tab);
});
