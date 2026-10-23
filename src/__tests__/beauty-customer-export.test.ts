import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({authorize:vi.fn(),feature:vi.fn(),hasFeature:vi.fn(),customers:vi.fn(),read:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({requireBeauty:m.authorize}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature,hasStoreFeature:m.hasFeature}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findMany:m.customers}}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.read}}));
import {getBeautyCustomerCsv} from '@/server/queries/beauty-customer-export';
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T04:00:00Z'));m.authorize.mockResolvedValue({});m.feature.mockResolvedValue(undefined);m.hasFeature.mockResolvedValue(true);m.customers.mockResolvedValue([{id:'c',name:'=FORMULA',phone:'0900000000',customerStage:'ACTIVE',createdAt:new Date('2026-10-22T20:00:00Z'),assignedStaff:{storeId:'foreign',displayName:'foreign-name'}}]);m.read.mockImplementation(async(sql:TemplateStringsArray)=>sql.join('').includes('BeautyCard')?[{id:'card',name:'五次共用卡',remaining:5,held:BigInt(2),expiresAt:new Date('2026-11-01T00:00:00Z'),memberIds:['c','other']}]:[{customerId:'c',participations:BigInt(4),completed:BigInt(2),lastVisitAt:new Date('2026-10-22T20:00:00Z')}]);});
afterEach(()=>vi.useRealTimers());
it('exports real service holds and completion using the same table and formula protection',async()=>{
 const csv=await getBeautyCustomerCsv('s',{cards:true,bookings:true});expect(csv).toContain("'=FORMULA");expect(csv).not.toContain('foreign-name');expect(csv).not.toContain('可用點數');expect(csv).toContain('五次共用卡（共卡）：剩餘5／占用2／可用3次');expect(csv).toContain('"3","4","2","2026-10-23","2026-10-23"');expect(m.read.mock.calls.every(c=>c.slice(1).every(v=>v==='s'))).toBe(true);expect(m.customers.mock.calls[0][0].where).toEqual({storeId:'s',mergedIntoCustomerId:null});
});
it('does not query card or booking data without their individual read scopes',async()=>{
 const csv=await getBeautyCustomerCsv('s',{cards:false,bookings:false});expect(m.read).not.toHaveBeenCalled();expect(csv).toContain('無檢視權限');m.hasFeature.mockResolvedValue(false);m.read.mockClear();await getBeautyCustomerCsv('s',{cards:true,bookings:false});expect(m.read).not.toHaveBeenCalled();
});
it('rejects module or feature failures before reading customer data',async()=>{
 m.authorize.mockRejectedValueOnce(Error('wrong module'));await expect(getBeautyCustomerCsv('foreign',{cards:true,bookings:true})).rejects.toThrow();expect(m.customers).not.toHaveBeenCalled();m.feature.mockRejectedValueOnce(Error('feature off'));await expect(getBeautyCustomerCsv('s',{cards:true,bookings:true})).rejects.toThrow();expect(m.customers).not.toHaveBeenCalled();
});
