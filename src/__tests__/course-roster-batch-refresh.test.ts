import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({after:vi.fn(),refresh:vi.fn(),manager:vi.fn(),correct:vi.fn(),audit:vi.fn(),music:vi.fn(),session:vi.fn(),count:vi.fn()}));
vi.mock('next/server',()=>({after:m.after}));
vi.mock('next/cache',()=>({revalidatePath:m.refresh,unstable_cache:(f:unknown)=>f}));
vi.mock('@/lib/auth',()=>({auth:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{}}));
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:async()=>true}));
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStoreFromEntitlements:m.music}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.manager,courseTransaction:async(_store:string,work:(tx:unknown)=>unknown,audit?:(result:unknown,tx:unknown)=>unknown)=>{const tx={courseSession:{findFirst:m.session},courseBooking:{count:m.count}};const result=await work(tx);await audit?.(result,tx);return result;}}));
vi.mock('@/server/services/course-booking',()=>({correctCourseAttendance:m.correct}));
vi.mock('@/server/services/course-low-balance-schedule',()=>({scheduleCourseLowBalanceCheck:vi.fn()}));
vi.mock('@/server/services/operation-audit-outbox',()=>({enqueueOperationAudit:m.audit}));
import {updateCourseRosterBatch} from '@/server/actions/course-members';
const input={sessionId:'session',target:'RESERVED',bookings:[{id:'booking',status:'ATTENDED'}]};
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'store',user:{id:'manager',name:'店長'}});m.music.mockResolvedValue(false);m.session.mockResolvedValue({id:'session'});m.count.mockResolvedValue(1);m.correct.mockResolvedValue({});});
it('returns only after the correction commits but defers dashboard invalidation',async()=>{
 expect(await updateCourseRosterBatch(input)).toMatchObject({success:true});expect(m.correct).toHaveBeenCalledOnce();expect(m.audit).toHaveBeenCalledOnce();
 expect(m.refresh).not.toHaveBeenCalled();expect(m.after).toHaveBeenCalledOnce();m.after.mock.calls[0][0]();expect(m.refresh.mock.calls.map(call=>call[0])).toEqual(['/dashboard','/dashboard/courses','/book']);
});
it('never schedules successful refresh when correction fails',async()=>{
 m.correct.mockRejectedValueOnce(Error('stale'));expect(await updateCourseRosterBatch(input)).toMatchObject({success:false});expect(m.after).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
