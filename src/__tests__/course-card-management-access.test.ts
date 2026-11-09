import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),members:vi.fn(),visible:vi.fn(),manage:vi.fn(),feature:vi.fn()}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock('@/server/services/course-card-management',()=>({manageCourseCard:m.manage}));
vi.mock('@/lib/db',()=>({prisma:{customer:{count:m.visible}}}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
import {saveCourseCardManagement} from '@/server/actions/course-card-management';
const input={expectedStoreId:'store',requestKey:'00000000-0000-4000-8000-000000000001',cardId:'card',operation:'close',expectedRemaining:10,expectedExpiresAt:'2027-04-22T15:59:59.999Z',reason:'學員確認'};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:'store',user:{id:'manager',role:'OWNER',staffId:'staff',name:'Synthetic manager'}});m.transaction.mockImplementation(async(_s,work)=>work({courseCardMember:{findMany:m.members}}));m.members.mockResolvedValue([{customerId:'customer'}]);m.visible.mockResolvedValue(1);m.manage.mockResolvedValue({id:'card',remaining:0,expiresAt:input.expectedExpiresAt,closed:true});});
it('requires wallet adjustment, card/customer read and active store features before mutation',async()=>{
 expect(await saveCourseCardManagement(input)).toMatchObject({success:true});expect(m.manager.mock.calls.map(c=>c[0])).toEqual(['wallet.adjust','customer.read','wallet.read']);expect(m.feature).toHaveBeenCalledTimes(2);expect(m.transaction).toHaveBeenCalledWith('store',expect.any(Function));expect(m.manage).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'store',userId:'manager'}),expect.objectContaining(input));
});
it.each(['permission','wrong-store','hidden-member','missing-member'])('rejects %s before changing a card',async kind=>{
 if(kind==='permission')m.manager.mockRejectedValue(Error('denied'));
 if(kind==='wrong-store')m.manager.mockResolvedValue({storeId:'other',user:{id:'manager',role:'OWNER'}});
 if(kind==='hidden-member')m.visible.mockResolvedValue(0);
 if(kind==='missing-member')m.members.mockResolvedValue([]);
 expect(await saveCourseCardManagement(input)).toMatchObject({success:false});expect(m.manage).not.toHaveBeenCalled();
});
it('requires every shared-card member to remain visible',async()=>{
 m.members.mockResolvedValue([{customerId:'one'},{customerId:'two'}]);m.visible.mockResolvedValue(1);expect(await saveCourseCardManagement(input)).toMatchObject({success:false});expect(m.manage).not.toHaveBeenCalled();
});
