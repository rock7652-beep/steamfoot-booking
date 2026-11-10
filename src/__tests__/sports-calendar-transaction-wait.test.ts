import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),native:vi.fn(),entitlement:vi.fn(),transaction:vi.fn(),ready:vi.fn(),ensure:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.manager,courseTransaction:vi.fn()}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{$transaction:m.transaction}}));
vi.mock('@/lib/db',()=>({prisma:{storeFeatureEntitlement:{findFirst:m.entitlement}}}));
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:m.native}));
vi.mock('@/server/services/sports-production-readiness',()=>({assertSportsProductionReady:m.ready}));
vi.mock('@/server/services/sports-permanent-series',()=>({ensureSportsMonth:m.ensure,readSportsSeries:vi.fn(),sportsLearners:{}}));
vi.mock('@/server/services/course-waitlist',()=>({cancelCourseWaitlistForSession:vi.fn()}));
vi.mock('@/server/services/course-booking',()=>({reserveCourseInTransaction:vi.fn(),settleCourseBooking:vi.fn()}));
vi.mock('@/lib/errors',async original=>({...await original<typeof import('@/lib/errors')>(),handleActionError:(e:Error)=>({success:false,error:e.message})}));
import {syncSportsPermanentCalendar} from '@/server/actions/sports-series';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VERCEL_ENV','production');m.manager.mockResolvedValue({storeId:'store-silverlily',user:{id:'staff',name:'老師'}});m.native.mockResolvedValue(true);m.entitlement.mockResolvedValue({});m.transaction.mockImplementation(async work=>work({catalog:'same transaction'}));m.ensure.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it('queues the exact production catalog check with a 10s acquisition budget and original 5s execution limit',async()=>{
 expect(await syncSportsPermanentCalendar('2026-11-10')).toEqual({success:true,warning:null});
 expect(m.transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function),{maxWait:10000,timeout:5000});
 expect(m.ready).toHaveBeenCalledWith({catalog:'same transaction'},'store-silverlily');expect(m.ensure).toHaveBeenCalledOnce();
});
it('does not synchronize after catalog failure or acquisition timeout and never retries writes',async()=>{
 m.ready.mockRejectedValueOnce(Error('catalog not ready'));expect((await syncSportsPermanentCalendar('2026-11-10')).success).toBe(false);expect(m.ensure).not.toHaveBeenCalled();
 m.transaction.mockClear();m.transaction.mockRejectedValueOnce(Error('acquisition timeout'));expect((await syncSportsPermanentCalendar('2026-11-10')).success).toBe(false);expect(m.transaction).toHaveBeenCalledOnce();expect(m.ensure).not.toHaveBeenCalled();
});
it.each(['manager','entitlement'])('still rejects %s before taking a catalog connection',async step=>{
 if(step==='manager')m.manager.mockRejectedValueOnce(Error('denied'));else m.entitlement.mockResolvedValueOnce(null);
 expect((await syncSportsPermanentCalendar('2026-11-10')).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();expect(m.ensure).not.toHaveBeenCalled();
});
it('preserves the original non-production readiness gate',async()=>{
 vi.stubEnv('VERCEL_ENV','preview');expect((await syncSportsPermanentCalendar('2026-11-10')).success).toBe(true);expect(m.transaction).not.toHaveBeenCalled();
});
