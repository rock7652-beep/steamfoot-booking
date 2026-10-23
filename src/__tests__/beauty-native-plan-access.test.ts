import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),permission:vi.fn(),feature:vi.fn(),transaction:vi.fn(),command:vi.fn(),plan:vi.fn(),service:vi.fn(),techs:vi.fn(),persist:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.transaction,command:m.command}));
vi.mock('@/server/beauty/catalog',()=>({persistBeautyCatalog:m.persist}));
import {saveBeautyNativePlan} from '@/server/actions/beauty-native-plan';
const prior={id:'p',revision:4,name:'五次方案',sessions:5,price:4500,validDays:90,active:true,allowShared:true,customerPurchasable:false,serviceIds:['s','s2'],lowBalanceEnabled:true,lowBalanceThreshold:2,expiryReminder:{enabled:true,days:[7]}};
const technician={id:'t',revision:3,serviceIds:['s'],rates:{s:{mode:'FIXED',value:300}}};
const tx={beautyPlan:{findFirst:m.plan},beautyService:{findFirst:m.service},beautyTechnician:{findMany:m.techs}};
const input={expectedStoreId:'a',requestKey:'00000000-0000-4000-8000-000000000001',id:'p',revision:4,unit:'SESSION',sportsMode:'LEGACY',subjectId:'s',name:'六次方案',sessions:6,price:5400,validDays:100,active:true,allowShared:true,customerPurchasable:true};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:'a'});m.permission.mockResolvedValue({});m.feature.mockResolvedValue(undefined);m.plan.mockResolvedValue(prior);m.service.mockResolvedValue({id:'s',storeId:'a',active:true,revision:7});m.techs.mockImplementation(async({where})=>where.id?[]:[technician]);m.transaction.mockImplementation((_a,work)=>work(tx));m.command.mockImplementation((_tx,_a,_key,_intent,work)=>work());m.persist.mockImplementation(async(_tx,_a,kind,value)=>({record:kind==='plan'?{...prior,...value,id:value.id??'new',revision:5}:value}));});
it('updates the real plan through the shared core while preserving legacy service scope and reminders',async()=>{
 expect(await saveBeautyNativePlan(input)).toMatchObject({success:true,storeId:'a',data:{id:'plan:p',catalogRevision:5,points:6,price:5400,templateIds:['s','s2']}});expect(m.persist.mock.calls[0][3]).toMatchObject({revision:4,serviceIds:['s','s2'],lowBalanceEnabled:true,lowBalanceThreshold:2,expiryReminder:prior.expiryReminder});expect(m.command.mock.calls[0][3]).toMatchObject({operation:'native-plan',requestKey:input.requestKey});
});
it('assigns new plans only to an authoritative current-store service',async()=>{
 const r=await saveBeautyNativePlan({...input,id:undefined,revision:undefined,sportsMode:'ASSIGNED'});expect(r).toMatchObject({success:true,data:{id:'plan:new',templateIds:['s']}});expect(m.plan).not.toHaveBeenCalled();expect(m.service).toHaveBeenCalledWith({where:{id:'s',storeId:'a'}});expect(m.persist.mock.calls[0][3]).toMatchObject({revision:0,lowBalanceEnabled:false,lowBalanceThreshold:null});
});
it.each([{expectedStoreId:'foreign'},{revision:3},{unit:'POINT'},{sportsMode:'OPEN'}])('rejects scope, stale revision and unsupported quota semantics %j',async patch=>{
 expect(await saveBeautyNativePlan({...input,...patch})).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();
});
it('rejects missing authority and feature entitlement before writes',async()=>{
 m.permission.mockRejectedValueOnce(Error('denied'));expect(await saveBeautyNativePlan({...input,qualification:{coachIds:[],expectedCoachIds:['t'],serviceRevision:7}})).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();m.feature.mockRejectedValueOnce(Error('off'));expect(await saveBeautyNativePlan(input)).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();
});
it('moves original coach controls through future-booking validation in the same transaction as the fee',async()=>{
 const retained={...technician,id:'retained'};m.techs.mockImplementation(async({where})=>where.id?[retained]:[technician,retained]);const qualified={...input,qualification:{coachIds:['retained'],expectedCoachIds:['t','retained'],serviceRevision:7}};expect(await saveBeautyNativePlan(qualified)).toMatchObject({success:true});expect(m.persist.mock.calls.map(c=>c[2])).toEqual(['technician','plan']);expect(m.persist.mock.calls[0][3]).toMatchObject({revision:3,serviceIds:[]});m.persist.mockClear();m.persist.mockRejectedValueOnce(Error('future appointment'));expect(await saveBeautyNativePlan(qualified)).toMatchObject({success:false});expect(m.persist).toHaveBeenCalledTimes(1);
});
it('rejects changed qualifications and service revisions before any mutation',async()=>{
 expect(await saveBeautyNativePlan({...input,qualification:{coachIds:[],expectedCoachIds:[],serviceRevision:7}})).toMatchObject({success:false});expect(await saveBeautyNativePlan({...input,qualification:{coachIds:[],expectedCoachIds:['t'],serviceRevision:6}})).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();
});
it('ignores untrusted store fields, customer prices and payment data outside the plan contract',async()=>{
 await saveBeautyNativePlan({...input,storeId:'foreign',paid:9000,serviceIds:['foreign'],cardIds:['foreign']});expect(m.persist.mock.calls[0][3]).not.toHaveProperty('paid');expect(m.persist.mock.calls[0][3].serviceIds).toEqual(prior.serviceIds);
});

it('changing the primary service preserves every other legacy service and never rewrites issued cards',async()=>{m.service.mockResolvedValue({id:'new-service',storeId:'a',active:true,revision:1});expect(await saveBeautyNativePlan({...input,subjectId:'new-service'})).toMatchObject({success:true,data:{templateIds:['new-service','s2']}});expect(m.persist.mock.calls[0][3].serviceIds).toEqual(['new-service','s2']);});

it('retains the original at-least-one-coach requirement instead of accepting a misleading empty qualification',async()=>{expect(await saveBeautyNativePlan({...input,qualification:{coachIds:[],expectedCoachIds:['t'],serviceRevision:7}})).toMatchObject({success:false});expect(m.persist).not.toHaveBeenCalled();});
