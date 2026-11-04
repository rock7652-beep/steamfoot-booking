import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({music:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStoreFromEntitlements:m.music}));
import {readCourseAgreementProfile} from '@/server/services/course-agreement-profile';
import {courseAgreementDraftSchema,emptyCourseAgreement} from '@/lib/course-agreement';
import {parseCourseAgreementSignerSnapshot} from '@/lib/course-agreement-signing';
beforeEach(()=>{vi.resetAllMocks();});
it('keeps fitness excluded even if a legacy deployment flag is enabled',async()=>{
 vi.stubEnv('COURSE_AGREEMENTS_FITNESS_ENABLED','1');m.music.mockResolvedValue(false);
 expect(await readCourseAgreementProfile('fitness-store')).toBeNull();
 m.music.mockResolvedValue(true);expect(await readCourseAgreementProfile('music-store')).toBe('MUSIC');
 vi.unstubAllEnvs();
});
it('rejects fitness drafts and evidence instead of silently treating them as music',()=>{
 expect(courseAgreementDraftSchema.safeParse({...emptyCourseAgreement(),profile:'FITNESS',business:'fitness'}).success).toBe(false);
 expect(()=>parseCourseAgreementSignerSnapshot({name:'測試',phone:'0911000001',minor:false,fitnessAcknowledgement:{course:true,risk:true}})).toThrow();
});
