import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),list:vi.fn(),assert:vi.fn(),staff:vi.fn(),tx:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{staff:{findFirst:m.staff},$transaction:m.tx}}));
vi.mock('next/cache',()=>({revalidatePath:m.revalidate}));
vi.mock('@/server/services/course-access',()=>({courseManager:async()=>({storeId:'store'}),courseManagerRead:vi.fn()}));
vi.mock('@/server/services/course-availability',()=>({listOutsideTeacherAvailability:m.list,assertExistingTeacherAvailability:m.assert}));
import { saveCourseStaffWeeklyAvailability,saveCourseStaffAvailabilityException } from '@/server/actions/course-availability';
beforeEach(()=>{vi.resetAllMocks();m.staff.mockResolvedValue({id:'teacher',courseCoachEnabled:true});m.tx.mockImplementation(fn=>fn({$executeRaw:m.execute,$queryRaw:vi.fn().mockResolvedValue([])}));m.list.mockResolvedValue([{id:'retained',name:'舊課'}]);});
it('commits changed weekly hours and returns retained classes rather than rejecting them',async()=>{
 const result=await saveCourseStaffWeeklyAvailability({staffId:'teacher',inheritStoreHours:false,days:[{dayOfWeek:1,periods:[{openTime:'10:00',closeTime:'12:00'}]}]});
 expect(result).toEqual({success:true,retainedSessions:[{id:'retained',name:'舊課'}]});expect(m.assert).not.toHaveBeenCalled();
 // Seven explicit weekdays prevent an empty custom week reverting to inherited hours.
 expect(m.execute).toHaveBeenCalledTimes(8);expect(m.revalidate).toHaveBeenCalled();
});
it('rejects overlapping periods without writing any weekly rows',async()=>{
 const result=await saveCourseStaffWeeklyAvailability({staffId:'teacher',inheritStoreHours:false,days:[{dayOfWeek:1,periods:[{openTime:'10:00',closeTime:'12:00'},{openTime:'11:00',closeTime:'13:00'}]}]});
 expect(result.success).toBe(false);expect(m.execute).not.toHaveBeenCalled();expect(m.list).not.toHaveBeenCalled();
});
it('single-date leave validates only the requested date',async()=>{
 await saveCourseStaffAvailabilityException({staffId:'teacher',date:'2026-10-03',type:'UNAVAILABLE'});
 expect(m.assert).toHaveBeenCalledWith(expect.anything(),'store','teacher','2026-10-03');
});
