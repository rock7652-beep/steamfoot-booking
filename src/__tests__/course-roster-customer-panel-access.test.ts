import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),booking:vi.fn(),workspace:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.manager}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseBooking:{findFirst:m.booking}}}));
vi.mock('@/server/queries/course-member-workspace',()=>({loadCourseMemberWorkspace:m.workspace}));
import {loadCourseRosterCustomer} from '@/server/actions/course-roster-customer';
const input={customerId:'student',sessionId:'session',expectedStoreId:'store'};
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'store'});m.booking.mockResolvedValue({id:'booking'});m.workspace.mockResolvedValue({storeId:'store',workspaceProps:{}});});
it('從同店課次讀取原生學員視窗，不讀顧客列表',async()=>{
 expect(await loadCourseRosterCustomer(input)).toMatchObject({success:true});
 expect(m.manager).toHaveBeenCalledWith('booking.read');expect(m.booking).toHaveBeenCalledWith({where:{storeId:'store',customerId:'student',sessionId:'session'},select:{id:true}});
 expect(m.workspace).toHaveBeenCalledWith('customers',{customerId:'student',dataScope:undefined},true);
});
it('店家切換時不讀名單或學員資料',async()=>{m.manager.mockResolvedValue({storeId:'other'});expect(await loadCourseRosterCustomer(input)).toMatchObject({success:false});expect(m.booking).not.toHaveBeenCalled();expect(m.workspace).not.toHaveBeenCalled();});
it('不是本課學員不可讀取',async()=>{m.booking.mockResolvedValue(null);expect(await loadCourseRosterCustomer(input)).toMatchObject({success:false});expect(m.workspace).not.toHaveBeenCalled();});
it('顧客權限或可見範圍拒絕時不回傳資料',async()=>{m.workspace.mockRejectedValue(new Error('FORBIDDEN'));expect(await loadCourseRosterCustomer(input)).toMatchObject({success:false});});
it('讀取過程店家改變時拒絕結果',async()=>{m.workspace.mockResolvedValue({storeId:'other',workspaceProps:{}});expect(await loadCourseRosterCustomer(input)).toMatchObject({success:false});});
