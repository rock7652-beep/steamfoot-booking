import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({after:vi.fn(),invalidate:vi.fn(),roster:vi.fn(),manager:vi.fn(),session:vi.fn(),feature:vi.fn(),people:vi.fn(),card:vi.fn(),cards:vi.fn(),holds:vi.fn(),entries:vi.fn(),bookings:vi.fn(),techs:vi.fn(),payments:vi.fn(),tx:vi.fn(),issue:vi.fn(),members:vi.fn(),profile:vi.fn(),note:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:m.invalidate}));
vi.mock('next/server',()=>({after:m.after}));
vi.mock('@/server/actions/beauty-native-roster',()=>({readBeautyNativeRoster:m.roster}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findMany:m.people}}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{beautyCard:{findMany:m.cards,findFirst:m.card},beautyAppointment:{groupBy:m.holds,findMany:m.bookings},beautyLedger:{findMany:m.entries},beautyTechnician:{findMany:m.techs},beautyPayment:{findMany:m.payments}}}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/lib/session',()=>({requireSession:m.session}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({assignedStaffId:'staff'})}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.tx}));
vi.mock('@/server/beauty/commerce',()=>({issueCard:m.issue}));
vi.mock('@/server/actions/beauty',()=>({updateBeautyCardMembers:m.members}));
vi.mock('@/server/actions/course-members',()=>({saveCourseCustomer:m.profile}));
vi.mock('@/server/actions/course-customer-note',()=>({saveCourseCustomerNote:m.note}));
import {browseBeautyNativeCards,readBeautyNativeCustomerBookings,readBeautyNativeCustomerPurchases,assignBeautyNativeCard,saveBeautyNativeCardMembers,saveBeautyNativeCustomerProfile} from '@/server/actions/beauty-native-customers';
const a={storeId:'a',userId:'owner',manager:true};
const card={id:'card',storeId:'a',customerId:'c',memberIds:['c'],planId:'plan',name:'五次方案',sessions:5,remaining:4,listPrice:5000,paid:4500,serviceIds:['s'],allowShared:true,expiresAt:new Date('2090-01-01'),closedAt:null};
const input={expectedStoreId:'a',customerId:'c',planId:'plan:plan',expiresDate:'2090-01-01',requestKey:'00000000-0000-4000-8000-000000000001',expectedListPrice:5000,expectedStoreCost:0,discountKind:'AMOUNT',discountValue:500,paymentMethod:'BANK_TRANSFER',transferLastFour:'1234'};
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue(a);m.session.mockResolvedValue({role:'PARTNER',staffId:'staff'});m.feature.mockResolvedValue(undefined);m.people.mockResolvedValue([{id:'c',name:'顧客',phone:'0900000000'}]);m.cards.mockResolvedValue([card]);m.card.mockResolvedValue(card);m.holds.mockResolvedValue([{cardId:'card',_count:{id:2}}]);m.entries.mockResolvedValue([{id:'entry',cardId:'card',kind:'DEBIT',delta:-1,createdAt:new Date('2026-10-23')}]);m.tx.mockImplementation((_a,work)=>work({local:true}));m.issue.mockResolvedValue({cardId:'card'});m.bookings.mockResolvedValue([]);m.techs.mockResolvedValue([]);m.payments.mockResolvedValue([]);});
it('projects actual balance and reservations without subtracting holds twice',async()=>{const result=await browseBeautyNativeCards({customerId:'c'});expect(result).toMatchObject({success:true,rows:[{remaining:4,held:2,available:2,entries:[]}],totals:[{remaining:4,held:2,available:2,count:1}]});expect(m.cards.mock.calls[0][0].where).toMatchObject({storeId:'a',memberIds:{hasSome:['c']}});expect(m.people.mock.calls[0][0].where).toMatchObject({storeId:'a',assignedStaffId:'staff',mergedIntoCustomerId:null});});
it('loads actual ledger only for scoped detail and masks invisible member identities',async()=>{m.cards.mockResolvedValue([{...card,memberIds:['c','foreign']}]);const r=await browseBeautyNativeCards({cardId:'card'});expect(r).toMatchObject({success:true,rows:[{members:[{id:'c'}],entries:[{kind:'DEBIT',points:-1}]}]});expect(m.entries).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'a',cardId:{in:['card']}}}));});
it.each(['manager','feature'] as const)('denies %s before reading module financial data',async key=>{m[key].mockRejectedValueOnce(Error('denied'));expect(await browseBeautyNativeCards({customerId:'c'})).toMatchObject({success:false});expect(m.cards).not.toHaveBeenCalled();});
it('rejects cross-store and invisible customer histories before module queries',async()=>{expect(await readBeautyNativeCustomerBookings('foreign')).toMatchObject({success:false});expect(await readBeautyNativeCustomerPurchases('foreign')).toMatchObject({success:false});expect(m.bookings).not.toHaveBeenCalled();expect(m.payments).not.toHaveBeenCalled();});
it('uses the original issue-card transaction with authoritative expected price and explicit expiry',async()=>{expect(await assignBeautyNativeCard(input)).toMatchObject({success:true});expect(m.issue).toHaveBeenCalledWith({local:true},a,expect.objectContaining({planId:'plan',customerId:'c',paid:4500,method:'BANK_TRANSFER',memberIds:[]}),undefined,{expiresDate:input.expiresDate,expectedListPrice:5000,transferLastFour:'1234'});expect(m.manager.mock.calls.map(c=>c[0])).toContain('wallet.adjust');});
it('cannot submit a discount without its extra permission',async()=>{m.manager.mockImplementation(async permission=>{if(permission==='wallet.adjust')throw Error('denied');return a;});expect(await assignBeautyNativeCard(input)).toMatchObject({success:false});expect(m.issue).not.toHaveBeenCalled();});
it('forwards the Beauty fixed-fee quote to the authoritative issue-card check',async()=>{
 expect(await assignBeautyNativeCard({...input,beautyExpectedStoreCost:1500})).toMatchObject({success:true});
 expect(m.issue).toHaveBeenCalledWith({local:true},a,expect.anything(),undefined,expect.objectContaining({expectedStoreCost:1500,expectedListPrice:5000}));
});
it('still rejects arbitrary course cost fields before issuing a Beauty card',async()=>{
 expect(await assignBeautyNativeCard({...input,expectedStoreCost:1500,beautyExpectedStoreCost:1500})).toMatchObject({success:false});
 expect(m.issue).not.toHaveBeenCalled();
});
it('rejects unscoped customers, arbitrary revenue attribution, invalid transfers and over-discounts before checkout',async()=>{for(const change of [{customerId:'foreign'},{revenueStaffId:'foreign'},{transferLastFour:'x'},{discountValue:5001}])expect(await assignBeautyNativeCard({...input,...change})).toMatchObject({success:false});expect(m.issue).not.toHaveBeenCalled();});
it('preserves member CAS and request replay identity through the existing membership core',async()=>{await saveBeautyNativeCardMembers({cardId:'card',expected:['c'],customerIds:['c','c2'],requestKey:input.requestKey});expect(m.members).toHaveBeenCalledWith({id:'card',expected:['c'],memberIds:['c','c2'],requestKey:input.requestKey});});
it('uses the original profile writer with explicit Beauty authorization',async()=>{await saveBeautyNativeCustomerProfile({id:'c',name:'更新'});expect(m.profile).toHaveBeenCalledWith({id:'c',name:'更新'},'beauty');});
it('limits a single customer card browse to that customer and related visible members',async()=>{await browseBeautyNativeCards({customerId:'c'});expect(m.people.mock.calls[0][0].where).toMatchObject({storeId:'a',assignedStaffId:'staff',id:{in:['c']}});expect(m.people.mock.calls[1][0].where.id.in).toEqual(['c']);});
it('limits card detail visibility to authorized members of the requested card',async()=>{await browseBeautyNativeCards({cardId:'card'});expect(m.card).toHaveBeenCalledWith({where:{id:'card',storeId:'a'},select:{memberIds:true}});expect(m.people.mock.calls[0][0].where.id.in).toEqual(['c']);});

it('returns the committed authorized roster without invalidating the active layout before response',async()=>{
 m.roster.mockResolvedValue({success:true,data:{roster:[{customerId:'c',status:'RESERVED',sportsBalance:{remaining:10}}]}});
 const result=await assignBeautyNativeCard({...input,beautyRosterSessionId:'booking:b'});
 expect(result).toMatchObject({success:true,rosterSnapshot:{sessionId:'booking:b',data:{roster:[{status:'RESERVED'}]}}});
 expect(m.roster).toHaveBeenCalledWith('booking:b');expect(m.invalidate).not.toHaveBeenCalled();
 expect(m.after).toHaveBeenCalledTimes(1);m.after.mock.calls[0][0]();expect(m.invalidate).toHaveBeenCalledWith('/dashboard/beauty');
});
it('keeps a purchase successful if the projection is denied or belongs to another learner',async()=>{
 m.roster.mockResolvedValueOnce({success:false,error:'denied'}).mockResolvedValueOnce({success:true,data:{roster:[{customerId:'foreign'}]}});
 for(let n=0;n<2;n++)expect(await assignBeautyNativeCard({...input,beautyRosterSessionId:'booking:b'})).toMatchObject({success:true});
 expect(m.issue).toHaveBeenCalledTimes(2);expect(m.roster).toHaveBeenCalledTimes(2);
});
it('returns a scoped authoritative card projection for profile checkout without reading a roster',async()=>{
 const result=await assignBeautyNativeCard(input);
 expect(result).toMatchObject({success:true,checkoutCards:{customerId:'c',result:{success:true,rows:[{id:'card',remaining:4}],totals:[{remaining:4}]}}});
 expect(m.manager.mock.calls.map(call=>call[0])).toContain('wallet.read');
 expect(m.roster).not.toHaveBeenCalled();expect(m.issue).toHaveBeenCalledOnce();
});
it('does not fail or repeat a committed checkout when card visibility is denied',async()=>{
 m.manager.mockImplementation(async permission=>{if(permission==='wallet.read')throw Error('denied');return a;});
 const result=await assignBeautyNativeCard(input);
 expect(result).toMatchObject({success:true});expect(result).not.toHaveProperty('checkoutCards');
 expect(m.issue).toHaveBeenCalledOnce();expect(m.cards).not.toHaveBeenCalled();
});
