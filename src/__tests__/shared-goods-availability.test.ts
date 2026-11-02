import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({order:vi.fn(),catalog:vi.fn(),feature:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{serviceAddOnOrder:{findFirst:m.order},serviceAddOnCatalog:{findUnique:m.catalog}}}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
import {sharedGoodsAvailable} from '@/server/services/shared-goods-availability';
beforeEach(()=>{vi.resetAllMocks();m.order.mockResolvedValue(null);m.feature.mockResolvedValue(false);});
it('hides unused shared goods while retaining existing orders after HQ closure',async()=>{
 expect(await sharedGoodsAvailable('s','STEAMFOOT')).toBe(false);expect(m.catalog).not.toHaveBeenCalled();
 m.order.mockResolvedValue({id:'historical'});expect(await sharedGoodsAvailable('s','STEAMFOOT')).toBe(true);
 expect(m.order).toHaveBeenCalledWith({where:{storeId:'s',module:'STEAMFOOT',ownership:'RESERVATION'},select:{id:true}});
});
it('uses active shared products regardless of the retired catalog switch',async()=>{
 m.feature.mockResolvedValue(true);const groups=[{id:'g',title:'茶',kind:'SHARED_GOODS',required:false,multiple:true,options:[{id:'tea',name:'茶',price:0,duration:0,active:true}]}];
 m.catalog.mockResolvedValue({enabled:false,groups});expect(await sharedGoodsAvailable('s','FITNESS')).toBe(true);
 m.catalog.mockResolvedValue({enabled:true,groups});expect(await sharedGoodsAvailable('s','FITNESS')).toBe(true);
 m.catalog.mockResolvedValue({enabled:true,groups:[{...groups[0],kind:'PERSON'}]});expect(await sharedGoodsAvailable('s','FITNESS')).toBe(false);
});

it('does not show shared goods on unrelated classes without historical orders',async()=>{
 m.feature.mockResolvedValue(true);m.catalog.mockResolvedValue({enabled:true,groups:[{id:'g',title:'茶',kind:'SHARED_GOODS',subjectIds:['A'],options:[{id:'tea',name:'茶',price:0,duration:0}]}]});
 expect(await sharedGoodsAvailable('s','FITNESS','A1','A')).toBe(true);
 expect(await sharedGoodsAvailable('s','FITNESS','B1','B')).toBe(false);
 expect(m.order).toHaveBeenLastCalledWith({where:{storeId:'s',module:'FITNESS',ownership:'RESERVATION',bookingId:'B1'},select:{id:true}});
});

vi.mock('@/lib/addons-db',async()=>({addonsPrisma:(await vi.importMock<{prisma:unknown}>('@/lib/db')).prisma}));
