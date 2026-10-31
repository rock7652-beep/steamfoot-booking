import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({profile:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStoreFromEntitlements:m.profile}));
import {readCourseDetailMusicStore} from '@/server/queries/course-detail-music-store';
import {withReadRequestMemo} from '@/server/services/read-request-memo';
beforeEach(()=>{vi.resetAllMocks();m.profile.mockResolvedValue(true);});
it('shares one current ordinary module read and rechecks revocation on a new request',async()=>{
 expect(await withReadRequestMemo(()=>Promise.all([readCourseDetailMusicStore('s'),readCourseDetailMusicStore('s')]))).toEqual([true,true]);expect(m.profile).toHaveBeenCalledOnce();
 m.profile.mockResolvedValue(false);expect(await withReadRequestMemo(()=>readCourseDetailMusicStore('s'))).toBe(false);expect(m.profile).toHaveBeenCalledTimes(2);
});
it('keeps stores and ordinary calls separate and does not heal a rejected module lookup',async()=>{
 await withReadRequestMemo(()=>Promise.all([readCourseDetailMusicStore('s'),readCourseDetailMusicStore('other')]));expect(m.profile).toHaveBeenCalledTimes(2);
 await readCourseDetailMusicStore('s');await readCourseDetailMusicStore('s');expect(m.profile).toHaveBeenCalledTimes(4);
 m.profile.mockRejectedValueOnce(new Error('unavailable'));const result=await withReadRequestMemo(()=>Promise.allSettled([readCourseDetailMusicStore('s'),readCourseDetailMusicStore('s')]));expect(result.every(r=>r.status==='rejected')).toBe(true);expect(m.profile).toHaveBeenCalledTimes(5);
 await expect(withReadRequestMemo(()=>readCourseDetailMusicStore('s'))).resolves.toBe(true);expect(m.profile).toHaveBeenCalledTimes(6);
});
