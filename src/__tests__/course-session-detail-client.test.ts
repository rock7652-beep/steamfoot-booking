// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readCourseSessionDetailClient} from '@/lib/course-session-detail-client';
const fetcher=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',fetcher);fetcher.mockResolvedValue({ok:true,json:async()=>({success:true,data:{roster:[]}})});});
afterEach(()=>vi.unstubAllGlobals());
it.each(['/s/another-music/admin','/s/a-sports-store/admin','/hq'])('uses the actual %s route prefix with a fresh authenticated POST',async prefix=>{
 window.history.replaceState(null,'',prefix+'/dashboard/courses?date=2026-11-27');await expect(readCourseSessionDetailClient('class-a',true,false)).resolves.toMatchObject({success:true});
 expect(fetcher).toHaveBeenCalledWith(prefix+'/dashboard/courses/session-detail',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'class-a',rosterOnly:true,trialOnly:false})});
});
it('does not substitute a saved response or action after an HTTP denial',async()=>{fetcher.mockResolvedValue({ok:false});await expect(readCourseSessionDetailClient('a',true)).rejects.toThrow('讀取失敗');expect(fetcher).toHaveBeenCalledOnce();});
