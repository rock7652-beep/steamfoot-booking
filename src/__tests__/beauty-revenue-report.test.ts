import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),feature:vi.fn(),payments:vi.fn(),cards:vi.fn(),bookings:vi.fn(),audits:vi.fn(),first:vi.fn(),people:vi.fn(),staff:vi.fn(),store:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({requireBeauty:m.scope}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findMany:m.people},staff:{findMany:m.staff},store:{findUniqueOrThrow:m.store}}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$transaction:async(work:(tx:unknown)=>unknown)=>work({beautyTransactionRevision:{findMany:async()=>[]},beautyPayment:{findMany:m.payments},beautyCard:{findMany:m.cards},beautyAppointment:{findMany:m.bookings},beautyEvent:{findMany:m.audits},$queryRaw:m.first})}}));
import {getBeautyRevenueReport} from '@/server/queries/beauty-revenue-report';
import {moduleStaffRevenueSummary} from '@/lib/module-revenue-report';
const sale={id:'sale',kind:'SALE',amount:1000,cardId:'card',appointmentId:null,originalPaymentId:null,method:'BANK_TRANSFER',note:'備註',actorUserId:'operator',createdAt:new Date('2026-09-30T16:30Z')};
const filters={startDate:'2026-10-01',endDate:'2026-10-31',storeFilter:{}};
beforeEach(()=>{vi.resetAllMocks();m.scope.mockResolvedValue(undefined);m.feature.mockResolvedValue(true);m.payments.mockImplementation(async({where})=>where.createdAt?[sale]:[]);m.cards.mockResolvedValue([{id:'card',customerId:'c',name:'八次方案'}]);m.bookings.mockResolvedValue([]);m.audits.mockResolvedValue([{body:JSON.stringify({cardId:'card',revenueStaffId:'manager'})}]);m.first.mockResolvedValue([{id:'sale'}]);m.people.mockResolvedValue([{id:'c',name:'原顧客',phone:'0900000111'}]);m.staff.mockResolvedValue([{id:'manager',userId:'manager-user',displayName:'原所屬店長',user:{role:'MANAGER'}},{id:'operator-staff',userId:'operator',displayName:'操作人員',user:{role:'OWNER'}}]);m.store.mockResolvedValue({name:'測試店'});});
it('uses true receipt posting dates, frozen assigned manager and normalized methods',async()=>{const r=await getBeautyRevenueReport('s',filters,{customers:true});expect(r.kpi).toMatchObject({totalRevenue:1000,txCount:1,customerCount:1});expect(r.data[0]).toMatchObject({transactionDate:'2026-10-01',staffId:'manager',coachName:'原所屬店長',createdByName:'操作人員',unit:'SESSION',paymentMethod:'TRANSFER'});expect(m.payments.mock.calls[0][0].where).toMatchObject({storeId:'s',createdAt:{gte:new Date('2026-09-30T16:00Z'),lte:new Date('2026-10-31T15:59:59.999Z')}});expect(moduleStaffRevenueSummary(r)[0]).toMatchObject({coachId:'manager',netRevenue:1000});});
it('keeps refund in its actual month and does not re-add an older original sale',async()=>{m.payments.mockImplementation(async({where})=>where.createdAt?[{...sale,id:'refund',kind:'REFUND',originalPaymentId:'sale',amount:-600,method:'CARD'}]:[{...sale,createdAt:new Date('2026-08-01T01:00Z')}]);const r=await getBeautyRevenueReport('s',filters,{customers:true});expect(r.kpi).toMatchObject({totalRevenue:0,refundAmount:600,netRevenue:-600,txCount:0});expect(r.data).toHaveLength(1);expect(r.data[0]).toMatchObject({paymentMethod:'CREDIT_CARD',staffId:'manager',refund:true});});
it('redacts customer identities and internal notes when independently denied',async()=>{const r=await getBeautyRevenueReport('s',filters);expect(m.people).not.toHaveBeenCalled();expect(r.data[0]).toMatchObject({customerId:null,customerName:'顧客',customerPhone:'',note:null});m.feature.mockResolvedValue(false);expect((await getBeautyRevenueReport('s',filters,{customers:true})).data[0].customerName).toBe('顧客');expect(m.people).not.toHaveBeenCalled();});
it('supports native manager and method filters without joining current customer assignments',async()=>{expect((await getBeautyRevenueReport('s',{...filters,coachId:'elsewhere'})).data).toEqual([]);expect((await getBeautyRevenueReport('s',{...filters,paymentMethod:'TRANSFER'})).kpi.netRevenue).toBe(1000);expect(m.people).not.toHaveBeenCalled();});
it('fails closed on wrong module and invalid dates before reading money',async()=>{await expect(getBeautyRevenueReport('s',{...filters,startDate:'2026-02-30'})).rejects.toThrow();expect(m.payments).not.toHaveBeenCalled();m.scope.mockRejectedValue(Error('wrong store'));await expect(getBeautyRevenueReport('foreign',filters)).rejects.toThrow('wrong store');expect(m.payments).not.toHaveBeenCalled();});

it('does not invent historical manager ownership from the payment operator',async()=>{m.audits.mockResolvedValue([]);const report=await getBeautyRevenueReport('s',filters,{customers:true});expect(report.data[0]).toMatchObject({staffId:null,coachName:null,createdByName:'操作人員'});});

it('reads single-service ownership and fixed fee from the original receipt, including discounts',async()=>{
 m.payments.mockImplementation(async({where})=>where.createdAt?[{...sale,cardId:null,appointmentId:'booking',amount:900}]:[]);
 m.cards.mockResolvedValue([]);m.bookings.mockResolvedValue([{id:'booking',customerId:'c',personName:'顧客',serviceName:'按摩',isTrial:false}]);
 m.audits.mockResolvedValue([{body:JSON.stringify({paymentId:'sale',revenueStaffId:'manager',allocation:{storeAmount:300,developerAmount:600,shortfall:0}})}]);
 const report=await getBeautyRevenueReport('s',filters,{customers:true});
 expect(report.data[0]).toMatchObject({staffId:'manager',coachName:'原所屬店長',netAmount:900,saleAllocation:{storeAmount:300,managerAmount:600,unassignedAmount:0,unknownAmount:0}});
 expect(report.kpi.saleAllocation).toEqual({storeAmount:300,managerAmount:600,unassignedAmount:0,unknownAmount:0});
 expect(moduleStaffRevenueSummary(report)[0]).toMatchObject({coachId:'manager',saleAllocation:{storeAmount:300,managerAmount:600}});
});
it('keeps cross-month refund rounding and owner filters consistent with the original frozen allocation',async()=>{
 const original={...sale,amount:3,createdAt:new Date('2026-08-01T01:00Z')};
 const first={...sale,id:'r1',kind:'REFUND',amount:-1,originalPaymentId:'sale',createdAt:new Date('2026-09-01T01:00Z')};
 const second={...first,id:'r2',createdAt:new Date('2026-10-02T01:00Z')};
 m.payments.mockImplementation(async({where})=>where.kind==='REFUND'?[first,second]:where.createdAt?[second]:[original]);
 m.audits.mockResolvedValue([{body:JSON.stringify({paymentId:'sale',cardId:'card',revenueStaffId:'manager',allocation:{storeAmount:1,developerAmount:2,shortfall:0}})}]);
 const report=await getBeautyRevenueReport('s',{...filters,coachId:'manager',paymentMethod:'TRANSFER'});
 expect(report.data).toHaveLength(1);expect(report.data[0]).toMatchObject({id:'r2',staffId:'manager',saleAllocation:{storeAmount:-1,managerAmount:0}});
 expect(report.kpi).toMatchObject({netRevenue:-1,saleAllocation:{storeAmount:-1,managerAmount:0}});
 expect(report.data.reduce((n,row)=>n+Object.values(row.saleAllocation!).reduce((a,b)=>a+b,0),0)).toBe(report.kpi.netRevenue);
 expect(m.payments).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'s',kind:'REFUND',originalPaymentId:{in:['sale']}})}));
});
it('can skip first-purchase scanning for a classification-only report without changing frozen amounts',async()=>{const report=await getBeautyRevenueReport('s',filters,{customers:false,includeFirstPurchase:false});expect(m.first).not.toHaveBeenCalled();expect(report.kpi.netRevenue).toBe(1000);});
