import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({plans:vi.fn(),orders:vi.fn(),trials:vi.fn(),raw:vi.fn(),payroll:vi.fn(),scope:vi.fn(),tuition:vi.fn()}));
vi.mock('@/lib/industry-module-server',()=>({requireCourseStore:m.scope}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{$transaction:async(work:(tx:unknown)=>unknown)=>work({coursePointPlan:{findMany:m.plans},coursePurchase:{findMany:m.orders},courseTrialPayment:{findMany:m.trials},$queryRaw:m.raw})}}));
vi.mock('@/server/services/course-monthly-settlement',()=>({readCourseMonthlySettlement:m.payroll}));
vi.mock('@/server/services/music-tuition',()=>({readMusicTuition:m.tuition}));
import {getCourseCostReview} from '@/server/queries/course-cost-review';
import {courseFeeCostVersion} from '@/lib/course-cost-review';
const at=new Date('2026-10-25T10:00:00Z');
const plan={id:'fee',name:'單堂',price:600,storeCost:200,points:1,unit:'SESSION',isActive:true,chargeSettings:null};
const quote={version:1,planId:'fee',storeCost:200,basePrice:600,quotedPrice:600,basePoints:1,purchasedPoints:1};
const order={id:'order',planId:'fee',name:'單堂',price:600,confirmedAt:at,status:'CONFIRMED',refunds:[],storeCostSnapshot:999};
const settings={kind:'single',durationMinutes:60,trialPrice:300,trialStoreCost:120,trialDuration:null,providerIds:['teacher']};
const trial={id:'trial',bookingId:'booking',amount:300,createdAt:at,voidedAt:null,booking:{session:{nameSnapshot:'體驗',chargeSnapshot:{planId:'fee',name:'單堂',price:600,settings,trialPrice:300,isTrial:true}}}};
beforeEach(()=>{vi.clearAllMocks();m.plans.mockResolvedValue([plan]);m.orders.mockResolvedValue([order]);m.trials.mockResolvedValue([trial]);m.raw.mockResolvedValue([]);m.tuition.mockResolvedValue(new Map());m.payroll.mockResolvedValue({lines:[{kind:'FEE',id:'session',label:'授課',name:'老師',date:at.toISOString(),amount:180,paid:0,issue:null}],legacyTestLines:[]});});
it('requires the course store and scopes every source, and never reads salary without its grant',async()=>{
 const report=await getCourseCostReview('store-a','2026-10',{fees:false});
 expect(m.scope).toHaveBeenCalledWith('store-a');for(const fn of [m.plans,m.orders,m.trials])expect(fn.mock.calls[0][0].where.storeId).toBe('store-a');
 expect(m.raw.mock.calls[0]).toContain('store-a');expect(m.payroll).not.toHaveBeenCalled();expect(report.fees).toBeNull();
 expect(report.purchases[0]).toMatchObject({cost:null,difference:null});expect(report.receipts[0]).toMatchObject({cost:120,difference:180});
});
it('uses transaction snapshots, omits refunded/voided estimates, and keeps costs unknown when explicitly recorded as null',async()=>{
 m.orders.mockResolvedValue([order,{...order,id:'refunded',refunds:[{amount:100}]}]);
 m.trials.mockResolvedValue([trial,{...trial,id:'unknown',bookingId:'unknown-booking'},{...trial,id:'voided',voidedAt:at}]);
 m.raw.mockResolvedValue([{targetType:'CoursePurchase',targetId:'order',afterJson:quote},{targetType:'CoursePurchase',targetId:'refunded',afterJson:quote},{targetType:'CourseBooking',targetId:'booking',afterJson:{paymentId:'trial',pricingSnapshot:{storeCost:80}}},{targetType:'CourseBooking',targetId:'unknown-booking',afterJson:{paymentId:'unknown',pricingSnapshot:{storeCost:null}}}]);
 const report=await getCourseCostReview('store-a','2026-10',{fees:true});
 expect(report.purchases[0]).toMatchObject({cost:200,difference:400});expect(report.purchases[1].difference).toBeNull();
 expect(report.receipts.map(t=>t.difference)).toEqual([220,null,null]);expect(report.fees).toHaveLength(1);
});
it('confirms only an exact fee version and does not silently approve later zero-cost edits',async()=>{
 const zero={...plan,storeCost:0},version=courseFeeCostVersion(zero);m.plans.mockResolvedValue([zero]);
 m.raw.mockResolvedValue([{targetType:'CoursePointPlan',targetId:'fee',afterJson:{version},createdAt:at},{targetType:'CoursePurchase',targetId:'order',afterJson:{...quote,storeCost:0,feeVersion:version}}]);
 const report=await getCourseCostReview('store-a','2026-10',{fees:false});expect(report.catalog[0].confirmedAt).toBe('2026-10-25');expect(report.purchases[0].difference).toBe(600);
 m.plans.mockResolvedValue([{...zero,price:601}]);expect((await getCourseCostReview('store-a','2026-10',{fees:false})).catalog[0].confirmedAt).toBeNull();
});
it('rejects invalid months before reading money',async()=>{await expect(getCourseCostReview('store-a','2026-13',{fees:false})).rejects.toThrow();expect(m.orders).not.toHaveBeenCalled();});

it('rejects a non-course store before financial reads',async()=>{m.scope.mockRejectedValueOnce(new Error('wrong module'));await expect(getCourseCostReview('wrong-store','2026-10',{fees:true})).rejects.toThrow('wrong module');expect(m.orders).not.toHaveBeenCalled();expect(m.payroll).not.toHaveBeenCalled();});
