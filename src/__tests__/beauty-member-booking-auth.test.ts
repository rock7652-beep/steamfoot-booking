import {beforeEach,expect,it,vi} from 'vitest';
import {AppError} from '@/lib/errors';
const m=vi.hoisted(()=>({manager:vi.fn(),permission:vi.fn(),rows:vi.fn(),charges:vi.fn(),member:vi.fn(),worker:vi.fn(),customer:vi.fn(),reserve:vi.fn(),availability:vi.fn(),allocate:vi.fn(),feature:vi.fn(),transition:vi.fn(),command:vi.fn(),bank:vi.fn(),notify:vi.fn(),queryRaw:vi.fn(),executeRaw:vi.fn(),plan:vi.fn(),order:vi.fn(),settings:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.customer},shopConfig:{findUnique:m.bank}}}));
vi.mock('@/server/beauty/manager-notifications',()=>({notifyBeautyBookingManagers:vi.fn(),notifyBeautyPurchaseManagers:m.notify}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission,checkPermission:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature,hasStoreFeature:vi.fn()}));
vi.mock('@/server/services/trial-booking-chat-link',()=>({resolveTrialBookingChatLink:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyMember:m.member,beautyManager:m.manager,beautyWorker:m.worker,beautyTransaction:async(_a:unknown,work:(tx:object)=>unknown)=>work({beautyAppointment:{findMany:m.rows},beautyPlan:{findFirst:m.plan},beautyPurchase:{create:m.order},$queryRaw:m.queryRaw,$executeRaw:m.executeRaw}),command:m.command,audit:vi.fn(),requireBeauty:vi.fn()}));
vi.mock('@/server/beauty/booking',()=>({reserveParty:m.reserve,loadAvailability:m.availability,findAllocation:m.allocate,transition:m.transition,ownsItem:vi.fn(),settings:m.settings,assertCustomerAvailable:vi.fn()}));
vi.mock('@/server/beauty/service-charges',()=>({serviceCharges:m.charges}));
import {bookBeautyParty,readBeautySlots,changeBeautyStatus,changeBeautyAttendance,collectBeautyPayment,readBeautyCollection,purchaseBeautyPlan,confirmBeautyPurchase,requestBeautyPlan} from '@/server/actions/beauty';
import {beautyMemberPurchaseFingerprint} from '@/server/beauty/member-purchase-intent';
const actor={storeId:'store',userId:'user',customerId:'owner'};
const payload=()=>({requestKey:crypto.randomUUID(),date:'2026-10-24',time:'09:30',people:[{serviceId:'face'},{serviceId:'massage',cardId:'shared'}]});
it('does not allow unguarded legacy plan issuance when staged plan intents are enabled',async()=>{vi.stubEnv('BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','1');m.manager.mockResolvedValue({...actor,manager:true});m.permission.mockResolvedValue(undefined);try{expect(await purchaseBeautyPlan({})).toMatchObject({success:false});expect(await confirmBeautyPurchase({})).toMatchObject({success:false});expect(m.command).not.toHaveBeenCalled();}finally{vi.unstubAllEnvs();}});
it('requires current booking visibility before a guarded single collection',async()=>{vi.stubEnv('BEAUTY_COLLECTION_INTENTS_ENABLED','1');m.permission.mockImplementation(async name=>{if(name==='booking.read')throw new AppError('FORBIDDEN','denied');});try{const r=await collectBeautyPayment({requestKey:crypto.randomUUID(),ids:['booking'],amounts:[900],method:'OTHER',note:''});expect(r).toMatchObject({success:false});expect(m.permission).toHaveBeenCalledWith('booking.read');expect(m.command).not.toHaveBeenCalled();}finally{vi.unstubAllEnvs();}});
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({...actor,manager:true});m.permission.mockResolvedValue(undefined);m.member.mockResolvedValue(actor);m.customer.mockResolvedValue({id:'owner',name:'會員本人',phone:'0900000000'});m.reserve.mockResolvedValue({groupId:'group',ids:['a','b']});m.availability.mockResolvedValue({slots:['09:15','09:45'],memberSlots:['09:00','09:30']});m.allocate.mockResolvedValue({});});
it('replays a recorded online request even if bank settings later disappear, while new requests still validate them',async()=>{
 const request={requestKey:crypto.randomUUID(),planId:'plan',lastFour:'1234',expectedName:'方案',expectedPrice:500,expectedSessions:10,expectedRevision:1};
 m.bank.mockResolvedValue(null);
 m.command.mockResolvedValueOnce({id:'existing-order'});
 expect(await requestBeautyPlan(request)).toEqual({success:true,data:{id:'existing-order'}});
 expect(m.bank).not.toHaveBeenCalled();
 m.command.mockImplementationOnce((_tx:unknown,_a:unknown,_key:unknown,_intent:unknown,work:()=>unknown)=>work());
 expect(await requestBeautyPlan({...request,requestKey:crypto.randomUUID()})).toMatchObject({success:false,error:'店家尚未設定銀行資料，請洽店家購買'});
 expect(m.bank).toHaveBeenCalledOnce();
});
it('writes a store notice for a new pending plan even when manager LINE notifications are off',async()=>{
 const request={requestKey:crypto.randomUUID(),planId:'plan',lastFour:'1234'};
 m.command.mockImplementationOnce((_tx:unknown,_a:unknown,_key:unknown,_intent:unknown,work:()=>unknown)=>work());
 m.bank.mockResolvedValueOnce({bankName:'銀行',bankAccountNumber:'123'});
 m.plan.mockResolvedValueOnce({id:'plan',name:'方案',price:500,sessions:10});m.order.mockResolvedValueOnce({id:'purchase'});m.settings.mockResolvedValue({notifications:false});
 expect(await requestBeautyPlan(request)).toMatchObject({success:true,data:{id:'purchase'}});
 expect(m.executeRaw).toHaveBeenCalledOnce();
 expect(m.executeRaw.mock.calls[0].slice(1)).toEqual([expect.any(String),'store','beauty-purchase-pending:purchase','TRANSFER_PENDING_CONFIRMATION','purchase']);
});
it('refuses to create a member order if the displayed plan revision or price has changed',async()=>{
 vi.stubEnv('BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED','1');vi.stubEnv('AUTH_SECRET','test-secret');
 const request={requestKey:crypto.randomUUID(),planId:'plan',lastFour:'1234',expectedName:'方案',expectedPrice:500,expectedSessions:10,expectedRevision:1};
 m.queryRaw.mockResolvedValueOnce([{requestKey:request.requestKey,customerId:'owner',actorUserId:'user',status:'PREPARED',fingerprint:beautyMemberPurchaseFingerprint(request),purchaseId:null}]);
 m.command.mockImplementationOnce((_tx:unknown,_a:unknown,_key:unknown,_intent:unknown,work:()=>unknown)=>work());
 m.bank.mockResolvedValueOnce({bankName:'銀行',bankAccountNumber:'123'});
 m.plan.mockResolvedValueOnce({id:'plan',name:'方案',price:600,sessions:10,revision:2});
 try{expect(await requestBeautyPlan(request)).toMatchObject({success:false,error:'方案內容或價格已變更，請重新核對並聯絡店家'});expect(m.order).not.toHaveBeenCalled();expect(m.executeRaw).not.toHaveBeenCalled();}
 finally{vi.unstubAllEnvs();}
});
it('does not allow a cancelled member request to create an online order when recovery is enabled',async()=>{
 vi.stubEnv('BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED','1');vi.stubEnv('AUTH_SECRET','test-secret');
 const request={requestKey:crypto.randomUUID(),planId:'plan',lastFour:'1234',expectedName:'方案',expectedPrice:500,expectedSessions:10,expectedRevision:1};
 m.queryRaw.mockResolvedValueOnce([{requestKey:request.requestKey,customerId:'owner',actorUserId:'user',status:'CANCELLED',fingerprint:null,purchaseId:null}]);
 try{expect(await requestBeautyPlan(request)).toMatchObject({success:false,error:'此申請已取消，不能再送出'});expect(m.command).not.toHaveBeenCalled();expect(m.notify).not.toHaveBeenCalled();}
 finally{vi.unstubAllEnvs();}
});
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
