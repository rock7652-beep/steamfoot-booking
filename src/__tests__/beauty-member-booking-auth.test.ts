import {beforeEach,expect,it,vi} from 'vitest';
import {AppError} from '@/lib/errors';
const m=vi.hoisted(()=>({member:vi.fn(),customer:vi.fn(),reserve:vi.fn(),availability:vi.fn(),allocate:vi.fn(),feature:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.customer}}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{}}));
vi.mock('@/lib/permissions',()=>({requirePermission:vi.fn(),checkPermission:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature,hasStoreFeature:vi.fn()}));
vi.mock('@/server/services/trial-booking-chat-link',()=>({resolveTrialBookingChatLink:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyMember:m.member,beautyManager:vi.fn(),beautyWorker:vi.fn(),beautyTransaction:async(_a:unknown,work:(tx:object)=>unknown)=>work({}),command:vi.fn(),audit:vi.fn(),requireBeauty:vi.fn()}));
vi.mock('@/server/beauty/booking',()=>({reserveParty:m.reserve,loadAvailability:m.availability,findAllocation:m.allocate,transition:vi.fn(),ownsItem:vi.fn(),settings:vi.fn(),assertCustomerAvailable:vi.fn()}));
import {bookBeautyParty,readBeautySlots} from '@/server/actions/beauty';
const actor={storeId:'store',userId:'user',customerId:'owner'};
const payload=()=>({requestKey:crypto.randomUUID(),date:'2026-10-24',time:'09:30',people:[{serviceId:'face'},{serviceId:'massage',cardId:'shared'}]});
beforeEach(()=>{vi.clearAllMocks();m.member.mockResolvedValue(actor);m.customer.mockResolvedValue({id:'owner',name:'會員本人',phone:'0900000000'});m.reserve.mockResolvedValue({groupId:'group',ids:['a','b']});m.availability.mockResolvedValue({slots:['09:15','09:45'],memberSlots:['09:00','09:30']});m.allocate.mockResolvedValue({});});
it('resolves identity from the authenticated store and leaves companions unlinked without fake contacts',async()=>{
 const d=payload();const r=await bookBeautyParty('member',{...d,contactName:'攻擊者',phone:'0911111111',isTrial:true,people:d.people.map(p=>({...p,customerId:'foreign',name:'冒用',phone:'0911111111'}))});expect(r.success).toBe(true);expect(m.customer.mock.calls[0][0].where).toEqual({storeId:'store',id:'owner',mergedIntoCustomerId:null});const normalized=m.reserve.mock.calls[0][2];expect(normalized).toMatchObject({contactName:'會員本人',phone:'0900000000',isTrial:false});expect(normalized.people[0]).toMatchObject({customerId:'owner',name:'會員本人',preference:'ANY'});expect(normalized.people[1]).toMatchObject({customerId:null,name:'同行者 1',phone:'',pendingIdentity:true,cardId:'shared'});
});
it('rejects anonymous callers and quarter-hour mutation before reservation',async()=>{
 m.member.mockRejectedValueOnce(new AppError('FORBIDDEN','請登入'));expect((await bookBeautyParty('member',payload())).success).toBe(false);expect(m.customer).not.toHaveBeenCalled();expect((await bookBeautyParty('member',{...payload(),time:'09:15'})).success).toBe(false);expect(m.reserve).not.toHaveBeenCalled();
});
it('returns the member half-hour grid rather than the shared legacy interval',async()=>{
 const r=await readBeautySlots('member','ignored',payload());expect(r).toEqual({success:true,data:{slots:['09:00','09:30']}});expect(m.allocate.mock.calls.map(c=>c[2].time)).toEqual(['09:00','09:30']);
});
