import {beforeEach,expect,it,vi} from 'vitest';
import {AppError} from '@/lib/errors';
const m=vi.hoisted(()=>({manager:vi.fn(),permission:vi.fn(),rows:vi.fn(),charges:vi.fn(),member:vi.fn(),worker:vi.fn(),customer:vi.fn(),reserve:vi.fn(),availability:vi.fn(),allocate:vi.fn(),feature:vi.fn(),transition:vi.fn(),command:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.customer}}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission,checkPermission:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature,hasStoreFeature:vi.fn()}));
vi.mock('@/server/services/trial-booking-chat-link',()=>({resolveTrialBookingChatLink:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyMember:m.member,beautyManager:m.manager,beautyWorker:m.worker,beautyTransaction:async(_a:unknown,work:(tx:object)=>unknown)=>work({beautyAppointment:{findMany:m.rows}}),command:m.command,audit:vi.fn(),requireBeauty:vi.fn()}));
vi.mock('@/server/beauty/booking',()=>({reserveParty:m.reserve,loadAvailability:m.availability,findAllocation:m.allocate,transition:m.transition,ownsItem:vi.fn(),settings:vi.fn(),assertCustomerAvailable:vi.fn()}));
vi.mock('@/server/beauty/service-charges',()=>({serviceCharges:m.charges}));
import {bookBeautyParty,readBeautySlots,changeBeautyStatus,changeBeautyAttendance,collectBeautyPayment,readBeautyCollection} from '@/server/actions/beauty';
const actor={storeId:'store',userId:'user',customerId:'owner'};
const payload=()=>({requestKey:crypto.randomUUID(),date:'2026-10-24',time:'09:30',people:[{serviceId:'face'},{serviceId:'massage',cardId:'shared'}]});
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({...actor,manager:true});m.permission.mockResolvedValue(undefined);m.member.mockResolvedValue(actor);m.customer.mockResolvedValue({id:'owner',name:'會員本人',phone:'0900000000'});m.reserve.mockResolvedValue({groupId:'group',ids:['a','b']});m.availability.mockResolvedValue({slots:['09:15','09:45'],memberSlots:['09:00','09:30']});m.allocate.mockResolvedValue({});});
it('resolves identity from the authenticated store and leaves companions unlinked without fake contacts',async()=>{
 const d=payload();const r=await bookBeautyParty('member',{...d,contactName:'攻擊者',phone:'0911111111',isTrial:true,people:d.people.map(p=>({...p,customerId:'foreign',name:'冒用',phone:'0911111111'}))});expect(r.success).toBe(true);expect(m.customer.mock.calls[0][0].where).toEqual({storeId:'store',id:'owner',mergedIntoCustomerId:null});const normalized=m.reserve.mock.calls[0][2];expect(normalized).toMatchObject({contactName:'會員本人',phone:'0900000000',isTrial:false});expect(normalized.people[0]).toMatchObject({customerId:'owner',name:'會員本人',preference:'ANY'});expect(normalized.people[1]).toMatchObject({customerId:null,name:'同行者 1',phone:'',pendingIdentity:true,cardId:'shared'});
});
it('rejects anonymous callers and quarter-hour mutation before reservation',async()=>{
 m.member.mockRejectedValueOnce(new AppError('FORBIDDEN','請登入'));expect((await bookBeautyParty('member',payload())).success).toBe(false);expect(m.customer).not.toHaveBeenCalled();expect((await bookBeautyParty('member',{...payload(),time:'09:15'})).success).toBe(false);expect(m.reserve).not.toHaveBeenCalled();
});
it('returns the member half-hour grid rather than the shared legacy interval',async()=>{
 const r=await readBeautySlots('member','ignored',payload());expect(r).toEqual({success:true,data:{slots:['09:00','09:30']}});expect(m.allocate.mock.calls.map(c=>c[2].time)).toEqual(['09:00','09:30']);
});

it('records a server-owned reason for member cancellation without weakening worker or manager validation',async()=>{
 m.command.mockImplementation((_tx:unknown,_actor:unknown,_key:string,_intent:unknown,work:()=>unknown)=>work());m.transition.mockResolvedValue({id:'booking'});
 expect((await changeBeautyStatus('member',{id:'booking',revision:0,target:'CANCELLED',requestKey:crypto.randomUUID()})).success).toBe(true);expect(m.transition.mock.calls[0][2].reason).toBe('顧客自行取消');
 m.transition.mockClear();expect((await changeBeautyStatus('member',{id:'booking',revision:0,target:'COMPLETED',requestKey:crypto.randomUUID()})).success).toBe(false);expect(m.transition).not.toHaveBeenCalled();
});

it('supplies an audit reason only for simple worker completion; corrections still require an explicit reason',async()=>{
 m.worker.mockResolvedValue({...actor,technicianId:'tech',grants:['complete']});m.command.mockImplementation((_tx:unknown,_actor:unknown,_key:string,_intent:unknown,work:()=>unknown)=>work());m.transition.mockResolvedValue({id:'booking'});
 expect((await changeBeautyStatus('work',{id:'booking',revision:0,target:'COMPLETED',requestKey:crypto.randomUUID()})).success).toBe(true);expect(m.transition.mock.calls[0][2].reason).toBe('技師確認服務完成');m.transition.mockClear();expect((await changeBeautyStatus('work',{id:'booking',revision:0,target:'RESERVED',requestKey:crypto.randomUUID()})).success).toBe(false);expect(m.transition).not.toHaveBeenCalled();
});

it('keeps manager completion immediate with a server audit reason, while corrections require a reason',async()=>{
 m.command.mockImplementation((_tx:unknown,_actor:unknown,_key:string,_intent:unknown,work:()=>unknown)=>work());m.transition.mockResolvedValue({id:'booking'});
 expect((await changeBeautyStatus('manager',{id:'booking',revision:0,target:'COMPLETED',requestKey:crypto.randomUUID()})).success).toBe(true);expect(m.transition.mock.calls[0][2].reason).toBe('後台確認服務完成');m.transition.mockClear();expect((await changeBeautyStatus('manager',{id:'booking',revision:0,target:'RESERVED',requestKey:crypto.randomUUID()})).success).toBe(false);expect(m.transition).not.toHaveBeenCalled();
});
it('rejects forged service discounts without transaction.discount before writing',async()=>{
 m.permission.mockRejectedValueOnce(new AppError('FORBIDDEN','沒有優惠權限'));
 expect((await collectBeautyPayment({requestKey:crypto.randomUUID(),ids:['booking'],amounts:[900],quotes:[{id:'booking',revision:0,price:1000,collected:0,discount:{kind:'AMOUNT',value:100}}],method:'OTHER',note:''})).success).toBe(false);expect(m.permission).toHaveBeenCalledWith('transaction.discount');expect(m.command).not.toHaveBeenCalled();
});
it('scopes service balance reads to the authorized store and denies foreign, duplicate or card-backed rows',async()=>{
 m.rows.mockResolvedValue([{id:'booking',cardId:null,status:'RESERVED'}]);m.charges.mockResolvedValue([{id:'booking',due:900}]);expect(await readBeautyCollection(['booking'])).toEqual({success:true,data:[{id:'booking',due:900}]});expect(m.manager).toHaveBeenCalledWith('transaction.create');expect(m.permission).toHaveBeenCalledWith('booking.read');expect(m.rows.mock.calls[0][0].where).toEqual({storeId:'store',id:{in:['booking']}});
 m.charges.mockClear();m.rows.mockResolvedValue([]);expect((await readBeautyCollection(['foreign'])).success).toBe(false);expect((await readBeautyCollection(['booking','booking'])).success).toBe(false);m.rows.mockResolvedValue([{id:'booking',cardId:'card',status:'RESERVED'}]);expect((await readBeautyCollection(['booking'])).success).toBe(false);expect(m.charges).not.toHaveBeenCalled();
});

it('authorizes explicit attendance choices and supplies the audit intent on the server',async()=>{
 m.command.mockImplementation((_tx:unknown,_a:unknown,_key:unknown,_intent:unknown,work:()=>unknown)=>work());m.transition.mockResolvedValue({id:'booking'});expect((await changeBeautyAttendance({requestKey:crypto.randomUUID(),id:'booking',revision:4,choice:'NO_SHOW_KEEP'})).success).toBe(true);expect(m.manager).toHaveBeenCalledWith('booking.update',true);expect(m.transition.mock.calls[0][2]).toMatchObject({target:'NO_SHOW',noShowDeduct:false,reason:'後台標記未出席不扣次'});
 m.transition.mockClear();m.manager.mockRejectedValueOnce(new AppError('FORBIDDEN','沒有出席權限'));expect((await changeBeautyAttendance({requestKey:crypto.randomUUID(),id:'booking',revision:4,choice:'ATTENDED'})).success).toBe(false);expect(m.transition).not.toHaveBeenCalled();
});
