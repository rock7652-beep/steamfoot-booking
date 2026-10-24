import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),feature:vi.fn(),transaction:vi.fn(),command:vi.fn(),service:vi.fn(),persist:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.transaction,command:m.command}));
vi.mock('@/server/beauty/catalog',()=>({persistBeautyCatalog:m.persist}));
import {saveBeautyServicePrice} from '@/server/actions/beauty-service-price';
const prior={id:'s',storeId:'a',revision:4,name:'做臉',category:'臉',duration:60,buffer:15,price:1000,trialPrice:500,trialDuration:null,active:true,defaultRate:{mode:'FIXED',value:200}};
const input={id:'s',revision:4,expectedStoreId:'a',requestKey:'00000000-0000-4000-8000-000000000001',price:1200,trialPrice:680,trialDuration:35};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:'a'});m.feature.mockResolvedValue(undefined);m.service.mockResolvedValue(prior);m.transaction.mockImplementation((_a,work)=>work({beautyService:{findFirst:m.service}}));m.command.mockImplementation((_tx,_a,_key,_intent,work)=>work());m.persist.mockImplementation(async(_tx,_a,_kind,row)=>({record:{...row,revision:5}}));});
it('writes merchant prices and trial time through the existing catalog writer, preserving other settings',async()=>{
 expect(await saveBeautyServicePrice(input)).toMatchObject({success:true,storeId:'a',data:{price:1200,trialPrice:680,trialDuration:35,duration:60,revision:5}});
 expect(m.manager).toHaveBeenCalledWith('plans.edit',true);expect(m.persist.mock.calls[0][3]).toMatchObject({id:prior.id,revision:4,name:prior.name,duration:60,buffer:15,price:1200,trialPrice:680,trialDuration:35});expect(m.persist.mock.calls[0][3]).not.toHaveProperty('defaultRate');expect(m.service).toHaveBeenCalledWith({where:{storeId:'a',id:'s',revision:4}});
});
it.each([{trialPrice:0,trialDuration:null},{trialPrice:null,trialDuration:30}])('keeps free, disabled and inherited trial settings distinct: %j',async patch=>{expect(await saveBeautyServicePrice({...input,...patch})).toMatchObject({success:true,data:patch});});
it.each([{expectedStoreId:'foreign'},{trialPrice:-1},{trialDuration:0},{trialDuration:721},{price:1.5}])('rejects invalid or cross-store input before writing %j',async patch=>{expect(await saveBeautyServicePrice({...input,...patch})).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();});
it('rejects stale or foreign service revisions and missing permissions',async()=>{m.service.mockResolvedValueOnce(null);expect(await saveBeautyServicePrice(input)).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();m.manager.mockRejectedValueOnce(Error('denied'));expect(await saveBeautyServicePrice(input)).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();});
it('strips unrelated fields instead of changing duration, qualifications, appointments or payments',async()=>{await saveBeautyServicePrice({...input,duration:10,buffer:0,name:'bad',storeId:'foreign',paid:50,defaultRate:null});expect(m.persist.mock.calls[0][3]).toMatchObject({duration:60,buffer:15,name:'做臉'});expect(m.persist.mock.calls[0][3]).not.toHaveProperty('paid');});

it('leaves unrelated JSON settings out of the pricing writer even for legacy records',async()=>{m.service.mockResolvedValue({...prior,defaultRate:{}});expect(await saveBeautyServicePrice(input)).toMatchObject({success:true});expect(m.persist.mock.calls[0][3]).not.toHaveProperty('defaultRate');});
