import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),permission:vi.fn(),feature:vi.fn(),transaction:vi.fn(),command:vi.fn(),persist:vi.fn(),service:vi.fn(),techs:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.transaction,command:m.command}));
vi.mock('@/server/beauty/catalog',()=>({persistBeautyCatalog:m.persist}));
import {saveBeautyNativeService} from '@/server/actions/beauty-native-service';
import {nativeBeautyService} from '@/lib/beauty/native-service';
const service={id:'s',storeId:'a',revision:4,name:'做臉',category:'保養',duration:60,buffer:15,price:1000,trialPrice:500,active:true,defaultRate:null};
const tech={id:'t',revision:3,serviceIds:['s'],rates:{s:{mode:'FIXED',value:300}}};
const tx={beautyService:{findFirst:m.service},beautyTechnician:{findMany:m.techs}};
const input={id:'s',revision:4,expectedStoreId:'a',requestKey:'00000000-0000-4000-8000-000000000001',name:'新做臉',category:'保養',duration:90,buffer:15,active:true,rule:{coachIds:['t'],expectedCoachIds:['t'],defaultRate:{mode:'PERCENT',value:50,base:'LIST'}}};
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'a'});m.permission.mockResolvedValue({});m.feature.mockResolvedValue(undefined);m.service.mockResolvedValue(service);m.techs.mockImplementation(async({where})=>where.id?where.id.in.map(()=>tech):[tech]);m.transaction.mockImplementation((_a,work)=>work(tx));m.command.mockImplementation((_tx,_a,_key,_intent,work)=>work());m.persist.mockImplementation(async(_tx,_a,kind,v)=>({record:kind==='service'?{...service,...v,id:'s',revision:5}:v}));});
it('uses the original catalog transaction and preserves customer prices while editing actual technician rules',async()=>{
 expect(await saveBeautyNativeService(input)).toMatchObject({success:true,storeId:'a',data:{revision:5,sportsRule:{coachIds:['t'],compensation:{mode:'SHARE',value:50}},catalogSnapshot:{price:1000,trialPrice:500}}});
 expect(m.persist.mock.calls[0][3]).toMatchObject({revision:4,price:1000,trialPrice:500,defaultRate:input.rule.defaultRate});
});
it('rejects stale service or technician qualification snapshots before mutations',async()=>{
 expect(await saveBeautyNativeService({...input,revision:3})).toMatchObject({success:false});
 expect(await saveBeautyNativeService({...input,rule:{...input.rule,expectedCoachIds:[]}})).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();
});
it('rejects cross-store input and missing rule-management permission',async()=>{
 expect(await saveBeautyNativeService({...input,expectedStoreId:'foreign'})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 m.permission.mockRejectedValueOnce(Error('denied'));expect(await saveBeautyNativeService(input)).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();
});
it('removes qualifications through original future-booking validation before clearing their inherited default',async()=>{
 expect(await saveBeautyNativeService({...input,rule:{...input.rule,coachIds:[],defaultRate:null}})).toMatchObject({success:true});
 expect(m.persist.mock.calls.map(c=>c[2])).toEqual(['technician','service']);expect(m.persist.mock.calls[0][3]).toMatchObject({serviceIds:[],revision:3});
 m.persist.mockReset();m.persist.mockRejectedValueOnce(Error('existing booking conflict'));expect(await saveBeautyNativeService({...input,rule:{...input.rule,coachIds:[],defaultRate:null}})).toMatchObject({success:false});expect(m.persist).toHaveBeenCalledTimes(1);
});
it.each([{mode:'FIXED',value:300},{mode:'HOURLY',value:400},{mode:'PERCENT',value:50,base:'LIST'}])('round-trips every supported service default without losing its mode',defaultRate=>{
 const row=nativeBeautyService({...service,defaultRate},['t']);expect(row.catalogSnapshot.defaultRate).toEqual(defaultRate);expect(row.sportsRule.compensation?.mode).toBe(defaultRate.mode==='FIXED'?'CLASS':defaultRate.mode==='HOURLY'?'HOUR':'SHARE');
});
it('lets profile-only editors preserve all technician and compensation settings',async()=>{
 const {rule,...basic}=input;expect(rule).toBeDefined();expect(await saveBeautyNativeService(basic)).toMatchObject({success:true});expect(m.permission).not.toHaveBeenCalled();expect(m.persist.mock.calls[0][3].defaultRate).toBeNull();
});

it('does not reveal technician compensation in a profile-only save receipt',async()=>{m.service.mockResolvedValue({...service,defaultRate:input.rule.defaultRate});const basic={...input,rule:undefined};const result=await saveBeautyNativeService(basic);expect(result).toMatchObject({success:true,data:{sportsRule:{compensation:null}}});if(result.success)expect((result.data as {catalogSnapshot:object}).catalogSnapshot).not.toHaveProperty('defaultRate');});
