import {afterEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{}}));
import {coursePrisma} from '@/lib/course-db';
import {withCourseCalendarRead,courseCalendarRead} from '@/server/services/course-calendar-read-scope';
afterEach(()=>vi.restoreAllMocks());
it('shares one read only inside the exact store, session, ordinary-client scope and re-reads next time',async()=>{
 const read=vi.fn().mockResolvedValue(7);
 await withCourseCalendarRead('a',['one','one','two'],async()=>{
  const scope=courseCalendarRead(coursePrisma,'a','one')!;
  expect(scope.sessionIds).toEqual(['one','two']);
  expect(await Promise.all([scope.once('cards',read),scope.once('cards',read)])).toEqual([7,7]);expect(read).toHaveBeenCalledOnce();
  expect(courseCalendarRead(coursePrisma,'other','one')).toBeUndefined();expect(courseCalendarRead(coursePrisma,'a','not-selected')).toBeUndefined();expect(courseCalendarRead({...coursePrisma},'a','one')).toBeUndefined();
 });
 expect(courseCalendarRead(coursePrisma,'a')).toBeUndefined();read.mockResolvedValue(3);
 expect(await withCourseCalendarRead('a',['one'],()=>courseCalendarRead(coursePrisma,'a')!.once('cards',read))).toBe(3);expect(read).toHaveBeenCalledTimes(2);
});
it('keeps concurrent stores and rejected reads isolated without turning failure into success',async()=>{
 const failing=vi.fn().mockRejectedValue(new Error('unavailable'));
 await Promise.all(['a','b'].map(store=>withCourseCalendarRead(store,['one'],async()=>{
  await new Promise(resolve=>setTimeout(resolve,1));const scope=courseCalendarRead(coursePrisma,store,'one')!;
  const values=await Promise.allSettled([scope.once('cards',failing),scope.once('cards',failing)]);expect(values.every(value=>value.status==='rejected')).toBe(true);
 })));
 expect(failing).toHaveBeenCalledTimes(2);
});
it('measures shared work once rather than adding every waiter and does not expose caller keys or values',async()=>{
 let now=100;vi.spyOn(performance,'now').mockImplementation(()=>now);
 await withCourseCalendarRead('private-store',['private-session'],async()=>{
  const scope=courseCalendarRead(coursePrisma,'private-store')!;
  const read=vi.fn(async()=>{now=137;return {phone:'private-phone'};});
  const first=scope.once('roster-bookings',read),second=scope.once('roster-bookings',read);
  expect(first).toBe(second);expect(await first).toEqual({phone:'private-phone'});
  expect(scope.sharedReadTimings()).toEqual([{stage:'roster-bookings',startMs:0,durationMs:37,uses:2,ok:true}]);
  const copy=scope.sharedReadTimings();copy[0].uses=99;
  await scope.once('private-customer-key',async()=>({name:'private-name'}));
  const timings=scope.sharedReadTimings();expect(timings[0].uses).toBe(2);expect(timings[1].stage).toBe('other');
  expect(JSON.stringify(timings)).not.toMatch(/private-/);expect(read).toHaveBeenCalledOnce();
 });
});
it('records failed shared reads without swallowing errors and starts fresh on the next request',async()=>{
 let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const failure=new Error('private database error');
 await withCourseCalendarRead('a',['one'],async()=>{
  const scope=courseCalendarRead(coursePrisma,'a')!;
  await expect(scope.once('sessions',async()=>{now=25;throw failure;})).rejects.toBe(failure);
  expect(scope.sharedReadTimings()).toEqual([{stage:'sessions',startMs:0,durationMs:25,uses:1,ok:false}]);
  expect(JSON.stringify(scope.sharedReadTimings())).not.toContain(failure.message);
 });
 await withCourseCalendarRead('a',['one'],async()=>{
  const scope=courseCalendarRead(coursePrisma,'a')!;expect(scope.sharedReadTimings()).toEqual([]);
  expect(await scope.once('sessions',async()=>7)).toBe(7);
  expect(scope.sharedReadTimings()[0]).toMatchObject({durationMs:0,uses:1,ok:true});
 });
});
