import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),tuition:vi.fn(),purchases:vi.fn(),customer:vi.fn(),people:vi.fn(),card:vi.fn(),bookings:vi.fn(),adjustments:vi.fn(),transaction:vi.fn(),visibility:vi.fn()}));
vi.mock('@/server/services/music-tuition',()=>({readMusicTuition:m.tuition}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:m.actor}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.customer,findMany:m.people}}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{$transaction:m.transaction}}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:m.visibility}));
vi.mock('@/server/services/music-plan-scope',()=>({musicCardWhere:()=>({})}));
vi.mock('@/server/services/course-session-adjustment-records',()=>({courseSessionAdjustmentRecords:m.adjustments}));
import {loadCourseCardProgress} from '@/server/actions/course-card-progress';
const input={cardId:'card',customerId:'student',expectedStoreId:'store'};
const card={id:'card',unit:'SESSION',requestKey:'purchase',musicOpeningStateRequired:false,members:[{customerId:'student'}],entries:[{points:10}]};
const lesson=(id='b1',date='2026-11-03T08:30:00Z',customerId='student')=>({id,customerId,customerName:'學員',pointCost:1,session:{startsAt:new Date(date),nameSnapshot:'舞蹈'}});
beforeEach(()=>{m.tuition.mockResolvedValue(new Map());m.purchases.mockResolvedValue([]);vi.clearAllMocks();m.actor.mockResolvedValue({storeId:'store',user:{id:'owner',role:'OWNER',staffId:null}});m.customer.mockResolvedValue({id:'student'});m.people.mockResolvedValue([{id:'student',name:'學員'}]);m.visibility.mockReturnValue({storeId:'store'});m.card.mockResolvedValue(card);m.bookings.mockResolvedValue([lesson()]);m.adjustments.mockResolvedValue([]);m.transaction.mockImplementation(async fn=>fn({coursePointCard:{findFirst:m.card},courseBooking:{findMany:m.bookings},coursePurchase:{findMany:m.purchases}}));});
it('按實際卡片授予堂數與已出席日期產生進度，不讀方案商品的預設堂數',async()=>{
 m.bookings.mockResolvedValue([lesson('b2','2026-11-10T08:30:00Z'),lesson()]);
 const r=await loadCourseCardProgress(input);expect(r).toMatchObject({success:true,data:{available:true,total:10,shared:false,completed:[{id:'b1',date:'2026-11-03T08:30:00.000Z'},{id:'b2',date:'2026-11-10T08:30:00.000Z'}]}});
 expect(m.actor.mock.calls.map(c=>c[0])).toEqual(['wallet.read','customer.read','booking.read','transaction.read']);
 expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'store',cardId:'card',status:'ATTENDED',pointCost:{gt:0},bookingKind:{not:'OPENING_MAKEUP'}}}));
 expect(m.transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'RepeatableRead'});
});
it('十堂全未上課仍有十個空格，不從預約或剩餘額度猜日期',async()=>{m.bookings.mockResolvedValue([]);expect(await loadCourseCardProgress(input)).toMatchObject({success:true,data:{available:true,total:10,completed:[]}});});
it('整份共用卡包含各使用人且保持日期，不按同名方案混合',async()=>{
 m.card.mockResolvedValue({...card,members:[{customerId:'student'},{customerId:'second'}]});m.people.mockResolvedValue([{id:'student',name:'甲'},{id:'second',name:'乙'}]);m.bookings.mockResolvedValue([lesson(),lesson('b2','2026-11-10T08:30:00Z','second')]);
 expect(await loadCourseCardProgress(input)).toMatchObject({success:true,data:{available:true,shared:true,completed:[{customerName:'甲'},{customerName:'乙'}]}});
});
it('共用卡有不可見使用人時保留權限範圍，不用空格假裝尚未上課',async()=>{
 m.visibility.mockReturnValue({assignedStaffId:'manager'});m.card.mockResolvedValue({...card,members:[{customerId:'student'},{customerId:'hidden'}]});
 const r=await loadCourseCardProgress(input);expect(r).toMatchObject({success:true,data:{available:false}});expect(JSON.stringify(r)).not.toContain('2026-11-03');
 expect(m.people).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({assignedStaffId:'manager',storeId:'store'})}));
});
it.each(['wallet.read','customer.read','booking.read'])('拒絕缺少 %s 的進度讀取',async permission=>{m.actor.mockImplementation(async p=>{if(p===permission)throw Error('denied');return{storeId:'store',user:{id:'owner'}};});expect(await loadCourseCardProgress(input)).toMatchObject({success:false});expect(m.card).not.toHaveBeenCalled();});
it('切店或學員不可見時不讀取課卡',async()=>{
 expect(await loadCourseCardProgress({...input,expectedStoreId:'other'})).toMatchObject({success:false});expect(m.card).not.toHaveBeenCalled();m.customer.mockResolvedValue(null);expect(await loadCourseCardProgress(input)).toMatchObject({success:false});expect(m.card).not.toHaveBeenCalled();
});
it('不是此學員的同店課卡時不查上課紀錄',async()=>{m.card.mockResolvedValue(null);expect(await loadCourseCardProgress(input)).toMatchObject({success:false});expect(m.bookings).not.toHaveBeenCalled();expect(m.card).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'card',storeId:'store',OR:expect.any(Array)})}));});
it.each([{...card,unit:'POINT'},{...card,musicOpeningStateRequired:true},{...card,entries:[]},{...card,entries:[{points:2001}]}])('點數、來源不完整或總堂數不可核對時沿用明細',async value=>{m.card.mockResolvedValue(value);expect(await loadCourseCardProgress(input)).toMatchObject({success:true,data:{available:false}});expect(m.bookings).not.toHaveBeenCalled();});
it('只採有效補登的實際日期，註銷與已更正補登不算已上課',async()=>{
 m.adjustments.mockResolvedValue([{id:'backfill',cardId:'card',customerId:'student',operation:'BACKFILL',quantity:2,occurredOn:'2026-10-20',reversalOf:null},{id:'old',cardId:'card',customerId:'student',operation:'BACKFILL',quantity:1,occurredOn:'2026-10-19',reversalOf:null},{id:'reverse',cardId:'card',customerId:'student',operation:'REVERSE',quantity:1,occurredOn:null,reversalOf:'old'},{id:'void',recordedAt:'2026-11-11T02:00:00Z',cardId:'card',customerId:'student',operation:'VOID',quantity:1,occurredOn:null,reversalOf:null}]);
 const r=await loadCourseCardProgress(input);expect(r).toMatchObject({success:true,data:{available:true,completed:[{id:'backfill:0',date:'2026-10-19T16:00:00.000Z'},{id:'backfill:1',date:'2026-10-19T16:00:00.000Z'},{id:'b1'}]}});
});
it('超出授予堂數或課次扣抵多堂時不補造格子',async()=>{m.card.mockResolvedValue({...card,entries:[{points:1}]});m.bookings.mockResolvedValue([lesson(),lesson('b2')]);expect(await loadCourseCardProgress(input)).toMatchObject({success:true,data:{available:false}});m.bookings.mockResolvedValue([{...lesson(),pointCost:2}]);expect(await loadCourseCardProgress(input)).toMatchObject({success:true,data:{available:false}});});
it('keeps void operation dates separate from attendance and removes the gray slots after reversal',async()=>{
 const original={id:'void',cardId:'card',customerId:'student',operation:'VOID',quantity:2,recordedAt:'2026-11-10T16:00:00Z',occurredOn:null,reversalOf:null};m.adjustments.mockResolvedValue([original]);
 expect(await loadCourseCardProgress(input)).toMatchObject({success:true,data:{available:true,completed:[{id:'b1'}],voided:[{date:'2026-11-10T16:00:00Z'},{date:'2026-11-10T16:00:00Z'}]}});
 m.adjustments.mockResolvedValue([original,{...original,id:'reverse',operation:'REVERSE',reversalOf:'void'}]);expect(await loadCourseCardProgress(input)).toMatchObject({success:true,data:{available:true,voided:[]}});
});

it('uses the purchased tuition amount above the grid even when only part has been received',async()=>{
 m.purchases.mockResolvedValue([{id:'order',price:500,createdAt:new Date('2026-10-01T02:00Z')}]);m.tuition.mockResolvedValue(new Map([['order',{due:3000}]]));
 expect(await loadCourseCardProgress(input)).toMatchObject({success:true,data:{available:true,purchasePrice:3000,purchasedAt:'2026-10-01T02:00:00.000Z'}});
 expect(m.purchases.mock.calls[0][0].where).toMatchObject({storeId:'store',cardId:'card',status:'CONFIRMED',voidedAt:null,customerId:{in:['student']}});
});
it('does not query or expose purchase amounts without financial read permission',async()=>{
 m.actor.mockImplementation(async permission=>{if(permission==='transaction.read')throw Error('denied');return{storeId:'store',user:{id:'owner'}};});
 expect(await loadCourseCardProgress(input)).toMatchObject({success:true,data:{available:true,canReadPrice:false,purchasePrice:null}});expect(m.purchases).not.toHaveBeenCalled();
});
