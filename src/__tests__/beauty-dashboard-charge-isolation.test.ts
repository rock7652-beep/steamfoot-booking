import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),catalog:vi.fn(),can:vi.fn(),raw:vi.fn().mockResolvedValue([]),many:vi.fn().mockResolvedValue([])}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findMany:m.many},staff:{findMany:m.many},businessHours:{findMany:m.many},specialBusinessDay:{findMany:m.many}}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.raw,beautyService:{findMany:m.many},beautyTechnician:{findMany:m.many},beautyPlan:{findMany:m.many},beautyCard:{findMany:m.many},beautyPayment:{findMany:m.many},beautyPurchase:{findMany:m.many},beautyAppointment:{findMany:m.many,groupBy:m.many}}}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.can}));
vi.mock('@/lib/session',()=>({getCurrentUser:async()=>({role:'OWNER',staffId:'owner'})}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({storeId:'store'})}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:async()=>true,requireStoreFeature:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager}));
vi.mock('@/server/beauty/charge-runtime',()=>({beautyChargeRulesEnabled:()=>true,readChargeCatalogForUi:m.catalog}));
vi.mock('@/server/beauty/booking',()=>({settings:async()=>({revision:0,selfBooking:false,notifications:false}),publicReceipt:vi.fn()}));
vi.mock('@/server/beauty/commerce',()=>({settlement:async()=>null}));
vi.mock('@/server/beauty/health',()=>({beautyHealthEnabled:async()=>false}));
vi.mock('@/server/beauty/service-charges',()=>({serviceCharges:async()=>[],servicePaymentLabel:vi.fn()}));
import {beautyDashboard} from '@/server/beauty/queries';
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'store'});m.can.mockResolvedValue(true);m.catalog.mockRejectedValue(Error('收費規則版本不符'));});
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
