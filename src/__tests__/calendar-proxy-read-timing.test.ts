import {afterEach,expect,it,vi} from 'vitest';
import {calendarProxyReadOperation,traceCalendarProxyRead} from '@/lib/calendar-proxy-read-timing';
import {measureMusicRead} from '@/lib/music-read-timing';
afterEach(()=>vi.restoreAllMocks());
it.each([
 ['POST','/s/store/admin/dashboard/courses/session-detail','sports-roster'],
 ['POST','/hq/dashboard/courses/session-detail','sports-roster'],
 ['GET','/s/store/admin/dashboard/courses/schedule-options','sports-options'],
 ['GET','/hq/dashboard/music-read?operation=session-detail','music-roster'],
 ['GET','/api/beauty/roster?scope=booking:private','beauty-roster'],
 ['POST','/api/beauty/roster',null],['GET','/s/store/admin/dashboard/courses',null],
 ['GET','/hq/dashboard/music-read?operation=purchases',null],['POST','/api/course/checkout',null],
])('profiles only known read operations: %s %s',(method,path,operation)=>{
 expect(calendarProxyReadOperation(method,new URL(path,'https://qa.test'))).toBe(operation);
});
it('preserves the response and only attaches numeric timings',async()=>{
 vi.spyOn(console,'info').mockImplementation(()=>{});
 const input=new Response('denied',{status:403,headers:{'Cache-Control':'private, no-store'}});
 const output=await traceCalendarProxyRead('sports-roster',()=>measureMusicRead('proxy.authentication',async()=>input));
 expect(output).toBe(input);expect(output.status).toBe(403);expect(output.headers.get('Cache-Control')).toBe('private, no-store');
 const times=JSON.parse(output.headers.get('X-Calendar-Proxy-Timing')!);expect(times['proxy.authentication.count']).toBe(1);expect(Object.values(times).every(x=>typeof x==='number')).toBe(true);
});
it('isolates concurrent timing scopes and propagates authorization failures',async()=>{
 vi.spyOn(console,'info').mockImplementation(()=>{});
 const replies=await Promise.all(['one','two'].map(name=>traceCalendarProxyRead('sports-roster',()=>measureMusicRead(name,async()=>new Response()))));
 expect(JSON.parse(replies[0].headers.get('X-Calendar-Proxy-Timing')!)).not.toHaveProperty('two');
 await expect(traceCalendarProxyRead('sports-roster',async()=>{throw new Error('forbidden')})).rejects.toThrow('forbidden');
});
