import {it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{}}));
import {coursePrisma} from '@/lib/course-db';
import {withCourseCalendarRead,courseCalendarRead} from '@/server/services/course-calendar-read-scope';
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
