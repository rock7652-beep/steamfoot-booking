import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({courseManager:vi.fn(),beautyManager:vi.fn(),session:vi.fn(),courseTx:vi.fn(),beautyTx:vi.fn(),members:vi.fn(),card:vi.fn(),people:vi.fn(),courseAdjust:vi.fn(),beautyAdjust:vi.fn(),feature:vi.fn()}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({assignedStaffId:'staff'})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.courseManager,courseTransaction:m.courseTx}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.beautyManager,beautyTransaction:m.beautyTx}));
vi.mock('@/server/services/course-session-adjustment',()=>({adjustCourseSessions:m.courseAdjust}));
vi.mock('@/server/beauty/session-adjustment',()=>({adjustBeautySessions:m.beautyAdjust}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findMany:m.people}}}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/lib/session',()=>({requireSession:m.session}));
import {saveCourseSessionAdjustment} from '@/server/actions/course-session-adjustment';
import {saveBeautySessionAdjustment} from '@/server/actions/beauty-session-adjustment';
const input={expectedStoreId:'store',requestKey:'00000000-0000-4000-8000-000000000001',cardId:'card',customerId:'learner',operation:'VOID',quantity:1,expectedRemaining:10,expectedExpiresAt:'2027-12-31T15:59:59.999Z'};
beforeEach(()=>{
  vi.resetAllMocks();const user={id:'manager',role:'MANAGER',staffId:'staff',name:'店長'};
  m.courseManager.mockResolvedValue({storeId:'store',user});m.beautyManager.mockResolvedValue({storeId:'store',userId:'manager',name:'店長',manager:true});m.session.mockResolvedValue(user);
  m.courseTx.mockImplementation(async(_s,work)=>work({courseCardMember:{findMany:m.members}}));m.beautyTx.mockImplementation(async(_a,work)=>work({beautyCard:{findFirst:m.card}}));
  m.members.mockResolvedValue([{customerId:'learner'}]);m.card.mockResolvedValue({customerId:'learner',memberIds:['learner']});m.people.mockResolvedValue([{id:'learner',name:'學員'}]);
  m.courseAdjust.mockResolvedValue({remaining:9});m.beautyAdjust.mockResolvedValue({remaining:9});
});
for(const [module,save] of [['course',saveCourseSessionAdjustment],['beauty',saveBeautySessionAdjustment]] as const){
  it(`${module}: validates wallet and customer permissions and passes the verified identity, optional reason`,async()=>{
    expect(await save(input)).toMatchObject({success:true});
    const manager=module==='course'?m.courseManager:m.beautyManager;
    expect(manager.mock.calls.map(c=>c[0])).toEqual(['wallet.adjust','customer.read','wallet.read']);
    const adjust=module==='course'?m.courseAdjust:m.beautyAdjust;
    expect(adjust).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'store',userId:'manager'}),expect.objectContaining({reason:'',customerId:'learner'}),'學員');
    expect(m.people.mock.calls[0][0].where).toMatchObject({storeId:'store',assignedStaffId:'staff',mergedIntoCustomerId:null});expect(m.feature).toHaveBeenCalledTimes(2);
  });
  it.each(['permission','wrong-store','hidden-member','foreign-learner','missing-member','invalid-quantity'])(`${module}: rejects %s before mutation`,async kind=>{
    if(kind==='permission'){m.courseManager.mockRejectedValue(Error('Denied'));m.beautyManager.mockRejectedValue(Error('Denied'));}
    if(kind==='wrong-store'){input.expectedStoreId='other';}
    if(kind==='hidden-member')m.people.mockResolvedValue([]);
    if(kind==='foreign-learner'){m.members.mockResolvedValue([{customerId:'other'}]);m.card.mockResolvedValue({customerId:'other',memberIds:['other']});}
    if(kind==='missing-member'){m.members.mockResolvedValue([]);m.card.mockResolvedValue(null);}
    const data=kind==='invalid-quantity'?{...input,quantity:0}:input;
    try{expect(await save(data)).toMatchObject({success:false});expect(m.courseAdjust).not.toHaveBeenCalled();expect(m.beautyAdjust).not.toHaveBeenCalled();}finally{input.expectedStoreId='store';}
  });
}
