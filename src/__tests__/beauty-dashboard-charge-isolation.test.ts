import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),catalog:vi.fn(),can:vi.fn(),payments:vi.fn(),purchases:vi.fn(),report:vi.fn(),rosters:vi.fn(),feature:vi.fn(),raw:vi.fn().mockResolvedValue([]),many:vi.fn().mockResolvedValue([])}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findMany:m.many},staff:{findMany:m.many},businessHours:{findMany:m.many},specialBusinessDay:{findMany:m.many}}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.raw,beautyService:{findMany:m.many},beautyTechnician:{findMany:m.many},beautyPlan:{findMany:m.many},beautyCard:{findMany:m.many},beautyPayment:{findMany:m.payments},beautyPurchase:{findMany:m.purchases},beautyAppointment:{findMany:m.many,groupBy:m.many}}}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.can}));
vi.mock('@/lib/session',()=>({getCurrentUser:async()=>({role:'OWNER',staffId:'owner'})}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({storeId:'store'})}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature,requireStoreFeature:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager}));
vi.mock('@/server/beauty/charge-runtime',()=>({beautyChargeRulesEnabled:()=>true,readChargeCatalogForUi:m.catalog}));
vi.mock('@/server/beauty/booking',()=>({settings:async()=>({revision:0,selfBooking:false,notifications:false}),publicReceipt:vi.fn()}));
vi.mock('@/server/beauty/commerce',()=>({settlement:m.report}));
vi.mock('@/server/beauty/calendar-rosters',()=>({preloadBeautyCalendarRosters:m.rosters}));
vi.mock('@/server/beauty/health',()=>({beautyHealthEnabled:async()=>false}));
vi.mock('@/server/beauty/service-charges',()=>({serviceCharges:async()=>[],servicePaymentLabel:vi.fn()}));
vi.mock('@/server/services/add-on-access',()=>({isBeautyServiceAddOnsEnabled:async()=>false}));
vi.mock('@/server/beauty/booking-shared-goods',()=>({publicBeautyGoodsCatalog:async()=>null}));
vi.mock('@/server/beauty/shared-goods-catalog',()=>({readBeautyGoodsCatalog:async()=>({revision:0,enabled:false,groups:[]})}));
import {beautyDashboard} from '@/server/beauty/queries';
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'store'});m.payments.mockResolvedValue([]);m.purchases.mockResolvedValue([]);m.report.mockResolvedValue(null);m.feature.mockResolvedValue(true);m.rosters.mockResolvedValue({storeId:'store',details:{}});m.can.mockResolvedValue(true);m.catalog.mockRejectedValue(Error('收費規則版本不符'));});
it('loads settings and other non-charge pages without the unrelated failing charge catalog, retaining the opening-check capability',async()=>{
 const data=await beautyDashboard('2026-10-25','2026-10','day',undefined,false,false,false);
 expect(data.chargeCatalog).toBeUndefined();expect(data.chargeRulesActive).toBe(true);expect(data.policy.selfBooking).toBe(false);expect(m.catalog).not.toHaveBeenCalled();
});
it('still validates the charge catalog when it is requested and never replaces a bad rule with unrestricted pricing',async()=>{
 await expect(beautyDashboard('2026-10-25','2026-10','day',undefined,false,false,true)).rejects.toThrow('版本不符');expect(m.catalog).toHaveBeenCalledOnce();
});
it('denies access before reading business data when the store authorization fails',async()=>{
 m.manager.mockRejectedValueOnce(Error('FORBIDDEN'));await expect(beautyDashboard('2026-10-25','2026-10','day',undefined,false,false,false)).rejects.toThrow('FORBIDDEN');expect(m.many).not.toHaveBeenCalled();expect(m.raw).not.toHaveBeenCalled();
});

it('calendar omits unrelated financial overview reads while preserving complete rosters and financial access',async()=>{
 const snapshot={storeId:'store',details:{'day:2026-10-25':{roster:[{id:'trial-and-card-fixture'}]}}};
 m.rosters.mockResolvedValue(snapshot);
 const data=await beautyDashboard('2026-10-25','2026-10','day',undefined,false,true,false,true,false);
 expect(m.payments).not.toHaveBeenCalled();expect(m.purchases).not.toHaveBeenCalled();expect(m.report).not.toHaveBeenCalled();
 expect(m.many.mock.calls.some(([query])=>query?.by?.includes('serviceName'))).toBe(false);
 expect(data.rosterSnapshots).toBe(snapshot);expect(data.access.financeAccess).toBe(true);expect(data.manage.collect).toBe(true);
});
it('other entries retain authorized financial overview queries by default',async()=>{
 await beautyDashboard('2026-10-25','2026-10','day',undefined,false,false,false);
 expect(m.payments).toHaveBeenCalledOnce();expect(m.purchases).toHaveBeenCalledOnce();expect(m.report).toHaveBeenCalledOnce();
 expect(m.many.mock.calls.some(([query])=>query?.by?.includes('serviceName'))).toBe(true);
});
it('checks independent features together before reading protected business data',async()=>{
 const pending:Array<()=>void>=[];
 m.feature.mockImplementation(()=>pending.length<4?new Promise(resolve=>pending.push(()=>resolve(true))):Promise.resolve(true));
 const read=beautyDashboard('2026-10-25','2026-10','day',undefined,false,false,false);
 await vi.waitFor(()=>expect(pending).toHaveLength(4));expect(m.many).not.toHaveBeenCalled();
 pending.forEach(resolve=>resolve());await expect(read).resolves.toBeTruthy();
});
it('starts complete roster preloading while unrelated purchase reads are pending, awaiting both before returning',async()=>{
 let release!:()=>void;
 m.purchases.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve([]);}));
 let finished=false;const read=beautyDashboard('2026-10-25','2026-10','day',undefined,false,true,false,true).then(data=>{finished=true;return data;});
 await vi.waitFor(()=>expect(m.rosters).toHaveBeenCalledOnce());expect(finished).toBe(false);
 release();await expect(read).resolves.toMatchObject({rosterSnapshots:{storeId:'store'}});
});
