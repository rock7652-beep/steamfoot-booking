import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),booking:vi.fn(),plans:vi.fn(),customer:vi.fn(),staff:vi.fn(),settings:vi.fn(),music:vi.fn()}));
vi.mock('@/lib/auth',()=>({auth:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.customer},staff:{findMany:m.staff}}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseBooking:{findFirst:m.booking},coursePointPlan:{findMany:m.plans}}}));
vi.mock('next/server',()=>({after:vi.fn()}));
vi.mock('next/cache',()=>({unstable_cache:(fn:unknown)=>fn,revalidatePath:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.access}));
vi.mock('@/lib/permissions',()=>({checkPermission:async()=>false}));
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStore:m.music}));
vi.mock('@/server/services/music-item-compatibility',()=>({musicItemTemplateIds:async()=>['item-a']}));
vi.mock('@/server/services/course-display-order',()=>({readCourseOrders:async()=>({})}));
vi.mock('@/server/services/course-monthly-settlement',()=>({readSettlementSettings:m.settings}));
import {loadCourseStudentPurchase,assignCoursePointCard} from '@/server/actions/course-members';
import {AppError} from '@/lib/errors';
beforeEach(()=>{
 vi.resetAllMocks();m.access.mockResolvedValue({user:{id:'owner-user',role:'OWNER',staffId:'owner'},storeId:'isolated'});
 m.booking.mockResolvedValue({customerId:'learner',customerName:'驗收學員',session:{templateId:'item-a',template:{musicSubjectId:null}}});
 m.plans.mockResolvedValue([]);m.customer.mockResolvedValue({id:'learner',assignedStaffId:null});
 m.staff.mockResolvedValue([{id:'owner',displayName:'本店店長'}]);m.settings.mockResolvedValue({profitEnabled:true});m.music.mockResolvedValue(false);
});
it('offers active same-store owners for a new learner without guessing a recipient',async()=>{
 expect(await loadCourseStudentPurchase('booking')).toMatchObject({success:true,data:{profitEnabled:true,revenueStaffOptions:[{id:'owner',displayName:'本店店長'}],defaultRevenueStaffId:''}});
 expect(m.access.mock.calls.map(c=>c[0])).toEqual(['wallet.create','transaction.create']);
 expect(m.staff).toHaveBeenCalledWith({where:{storeId:'isolated',status:'ACTIVE',user:{status:'ACTIVE',role:'OWNER'}},select:{id:true,displayName:true},orderBy:{displayName:'asc'}});
});
it.each([['owner','owner'],['inactive-or-other-store','']])('only presets a current eligible owner (%s)',async(assigned,expected)=>{
 m.customer.mockResolvedValue({id:'learner',assignedStaffId:assigned});expect(await loadCourseStudentPurchase('booking')).toMatchObject({success:true,data:{defaultRevenueStaffId:expected}});
});
it('omits allocation for a store that disabled profit splitting',async()=>{
 m.settings.mockResolvedValue({profitEnabled:false});expect(await loadCourseStudentPurchase('booking')).toMatchObject({success:true,data:{profitEnabled:false,revenueStaffOptions:[],defaultRevenueStaffId:''}});
});
it('keeps music period checkout independent of sports sale attribution',async()=>{
 m.music.mockResolvedValue(true);expect(await loadCourseStudentPurchase('booking')).toMatchObject({success:true,data:{music:true,profitEnabled:false,revenueStaffOptions:[]}});expect(m.settings).not.toHaveBeenCalled();expect(m.staff).not.toHaveBeenCalled();
});
it('does not disclose recipients or learner data without checkout permission',async()=>{
 m.access.mockRejectedValue(new AppError('FORBIDDEN','沒有權限'));expect(await loadCourseStudentPurchase('booking')).toMatchObject({success:false});expect(m.customer).not.toHaveBeenCalled();expect(m.staff).not.toHaveBeenCalled();
});
it.each([
 ['another store',{user:{id:'owner-user'},storeId:'other-store'}],
 ['another identity',{user:{id:'other-user'},storeId:'isolated'}],
])('rejects %s between independent checkout grants before reading learner or plan data',async(_reason,financial)=>{
 m.access.mockImplementation(async permission=>permission==='transaction.create'?financial:{user:{id:'owner-user',role:'OWNER',staffId:'owner'},storeId:'isolated'});
 expect(await loadCourseStudentPurchase('booking')).toMatchObject({success:false,error:'店家範圍不一致'});
 expect(await assignCoursePointCard({})).toMatchObject({success:false,error:'店家範圍不一致'});
 expect(m.booking).not.toHaveBeenCalled();expect(m.customer).not.toHaveBeenCalled();expect(m.plans).not.toHaveBeenCalled();
});
