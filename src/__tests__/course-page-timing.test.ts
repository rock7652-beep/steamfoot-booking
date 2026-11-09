import {expect,it} from 'vitest';
import {createCoursePageTiming,coursePageTimingVisible} from '@/server/services/course-page-timing';
it('records overlapping reads separately from consecutive wall-time phases',async()=>{
 let clock=0;const timer=createCoursePageTiming(()=>clock);
 clock=10;timer.mark('access');
 let release!:()=>void;
 const pending=timer.read('sessions',()=>new Promise<void>(resolve=>{release=resolve;}));
 clock=15;await timer.read('rooms',async()=>{clock=20;});clock=30;release();await pending;timer.mark('calendar_batch');
 const snapshot=timer.snapshot();expect(snapshot.totalMs).toBe(30);
 expect(snapshot.phases.map(s=>s.durationMs)).toEqual([10,20]);
 expect(snapshot.reads).toEqual([{name:'rooms',startMs:15,durationMs:5,ok:true},{name:'sessions',startMs:10,durationMs:20,ok:true}]);
});
it('preserves failures and records only fixed stage labels and durations',async()=>{
 const timer=createCoursePageTiming();await expect(timer.read('rooms',async()=>{throw Error('private payload');})).rejects.toThrow('private payload');
 const snapshot=timer.snapshot();expect(snapshot.reads[0]).toMatchObject({name:'rooms',ok:false});expect(JSON.stringify(snapshot)).not.toContain('private payload');
});
it('does not expose diagnostics outside the opted-in authorized isolated owner Preview',()=>{
 const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'perf/sports-course-loading'};
 expect(coursePageTimingVisible('1','sports-live-flow-store','OWNER',env)).toBe(true);
 for(const mutation of [{VERCEL_ENV:'production'},{VERCEL:'0'},{VERCEL_GIT_COMMIT_REF:'main'}])expect(coursePageTimingVisible('1','sports-live-flow-store','OWNER',{...env,...mutation})).toBe(false);
 expect(coursePageTimingVisible(undefined,'sports-live-flow-store','OWNER',env)).toBe(false);
 expect(coursePageTimingVisible('1','store-silverlily','OWNER',env)).toBe(false);
 expect(coursePageTimingVisible('1','sports-live-flow-store','STAFF',env)).toBe(false);
});
