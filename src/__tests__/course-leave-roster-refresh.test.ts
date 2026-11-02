import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({after:vi.fn(),refresh:vi.fn(),manager:vi.fn(),member:vi.fn(),settle:vi.fn(),audit:vi.fn(),snapshot:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/server',()=>({after:m.after}));
vi.mock('next/cache',()=>({revalidatePath:m.refresh,unstable_cache:(f:unknown)=>f}));
vi.mock('@/lib/auth',()=>({auth:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{}}));
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:async()=>false}));
vi.mock('@/server/services/course-low-balance-schedule',()=>({scheduleCourseLowBalanceCheck:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.manager,courseMember:m.member,courseTransaction:async(_store:string,work:(tx:unknown)=>Promise<unknown>,audit?:(result:unknown,tx:unknown)=>Promise<unknown>)=>{const tx={courseBooking:{findFirst:async()=>({bookingKind:'CARD'})}};const result=await work(tx);await audit?.(result,tx);return result;}}));
vi.mock('@/server/services/course-booking',()=>({settleCourseBooking:m.settle}));
vi.mock('@/server/services/operation-audit-outbox',()=>({enqueueOperationAudit:m.audit}));
vi.mock('@/server/queries/course-purchase-roster',()=>({readCommittedCourseRoster:m.snapshot}));
import {updateCourseBookingStatus} from '@/server/actions/course-members';
import {AppError} from '@/lib/errors';
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'store',user:{id:'manager',name:'店長'}});m.member.mockResolvedValue({storeId:'store',user:{id:'member'},customer:{id:'student',name:'學員'}});m.settle.mockResolvedValue({sessionId:'session'});m.snapshot.mockResolvedValue({sessionId:'session',data:{roster:[]}});});
it('commits a roster leave and returns its authorized snapshot without synchronous route invalidation',async()=>{
 const result=await updateCourseBookingStatus({bookingId:'booking',status:'STUDENT_LEAVE',returnRoster:true});
 expect(result).toMatchObject({success:true,rosterSnapshot:{sessionId:'session'}});
 expect(m.manager).toHaveBeenCalledWith('booking.update');expect(m.settle).toHaveBeenCalledOnce();expect(m.audit).toHaveBeenCalledOnce();
 expect(m.snapshot).toHaveBeenCalledWith('store','session');expect(m.refresh).not.toHaveBeenCalled();
 // Waitlist scheduling remains first; invalidation is deferred, never removed.
 expect(m.after).toHaveBeenCalledTimes(2);m.after.mock.calls[1][0]();
 expect(m.refresh.mock.calls.map(call=>call[0])).toEqual(['/dashboard','/dashboard/courses','/book']);
});
it.each([false,true])('retains normal member/non-roster cache invalidation; member=%s',async member=>{
 expect(await updateCourseBookingStatus({bookingId:'booking',status:'STUDENT_LEAVE',member})).toMatchObject({success:true});
 expect(m.refresh.mock.calls.map(call=>call[0])).toEqual(['/dashboard','/dashboard/courses','/book']);expect(m.snapshot).not.toHaveBeenCalled();
 if(member)expect(m.member).toHaveBeenCalledWith({write:true});
});
it('never returns a successful snapshot or invalidation for a rejected leave',async()=>{
 m.settle.mockRejectedValueOnce(new AppError('CONFLICT','名單已變更'));
 expect(await updateCourseBookingStatus({bookingId:'booking',status:'STUDENT_LEAVE',returnRoster:true})).toMatchObject({success:false});
 expect(m.snapshot).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(m.after).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();
});
