import {expect,it} from 'vitest';
import {courseBookingBrowse} from '@/lib/course-booking-browse';
it.each(['all','upcoming','history'])('keeps %s date and status boundaries when searching an item',mode=>{
 const now=new Date('2026-11-14T00:00:00Z');
 const baseline=courseBookingBrowse({mode,from:'2026-01-01',to:'2026-01-31'},now);
 const filtered=courseBookingBrowse({mode,from:'2026-01-01',to:'2026-01-31',item:'吉他'},now);
 expect(filtered.where).toEqual({AND:[baseline.where,{OR:[{card:{nameSnapshot:{contains:'吉他',mode:'insensitive'}}},{session:{nameSnapshot:{contains:'吉他',mode:'insensitive'}}}]}]});
 expect(filtered.order).toBe(baseline.order);
});
it('rejects oversized item searches and inverted dates before query construction',()=>{
 expect(()=>courseBookingBrowse({item:'字'.repeat(101)})).toThrow();
 expect(()=>courseBookingBrowse({from:'2026-11-14',to:'2026-11-01',item:'吉他'})).toThrow();
});
