import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),permission:vi.fn(),feature:vi.fn(),transaction:vi.fn(),command:vi.fn(),audit:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.transaction,command:m.command,audit:m.audit}));
vi.mock('@/server/beauty/charge-runtime',()=>({beautyChargeRulesEnabled:()=>false,beautyChargeEditingEnabled:()=>false,initializeEmptyBeautyOpening:vi.fn(),maintainCatalogCharge:vi.fn()}));
import {saveBeautyNativeService} from '@/server/actions/beauty-native-service';
import {allocateParty} from '@/lib/beauty/allocation';
const key='00000000-0000-4000-8000-000000000001';
let services:Record<string,unknown>[],tech:Record<string,unknown>;
const tx={
 beautyService:{
  findMany:vi.fn(async({where})=>services.filter(s=>s.duration===where.duration)),
  create:vi.fn(async({data})=>{const row={...data,defaultRate:data.defaultRate??null,id:'new90',revision:0};services.push(row);return row;}),
  findFirst:vi.fn(async()=>services[0]??null),
  count:vi.fn(async({where})=>where.id.in.length),
 },
 beautyTechnician:{
  findMany:vi.fn(async({where})=>where.id?.in?.length===0?[]:[tech]),findFirst:vi.fn(async()=>tech),
  update:vi.fn(async({data})=>{tech={...tech,...data,revision:Number(tech.revision)+1};return tech;}),
 },
 beautyAppointment:{findMany:vi.fn(async()=>[])},
};
const input={expectedStoreId:'a',requestKey:key,name:'全身按摩90',category:'按摩',duration:90,buffer:10,active:true,rule:{coachIds:['t'],expectedCoachIds:[]}};
beforeEach(()=>{
 vi.clearAllMocks();services=[];tech={id:'t',storeId:'a',revision:3,name:'技師',gender:'FEMALE',serviceIds:['old60'],rates:{old60:{mode:'FIXED',value:300}},weekly:{inheritStore:true},exceptions:{},grants:[],active:true};
 m.manager.mockResolvedValue({storeId:'a',userId:'owner',manager:true});m.transaction.mockImplementation((_a,work)=>work(tx));m.command.mockImplementation((_tx,_a,_key,_intent,work)=>work());
});
it('creates a 90 minute service and qualifications through the real catalog without inventing compensation',async()=>{
 const result=await saveBeautyNativeService(input);
 expect(result,JSON.stringify(result)).toMatchObject({success:true,storeId:'a',data:{id:'new90',sportsRule:{coachIds:['t'],compensation:null},catalogSnapshot:{duration:90,buffer:10,defaultRate:null}}});
 expect(tech.serviceIds).toEqual(['old60','new90']);expect(tech.rates).toEqual({old60:{mode:'FIXED',value:300}});
 expect(m.audit).toHaveBeenCalledTimes(2);
});
it('ignores a stale hidden compensation control instead of parsing or saving it',async()=>{
 expect(await saveBeautyNativeService({...input,rule:{...input.rule,defaultRate:{mode:null,value:0}}})).toMatchObject({success:true});
 expect(services[0].defaultRate).toBeNull();expect(tech.rates).toEqual({old60:{mode:'FIXED',value:300}});
});
it('does not turn a saved qualification into a bookable technician until pay is explicitly configured',async()=>{
 await saveBeautyNativeService(input);
 const issue:string[]=[];
 const service={...services[0],id:'new90',name:'全身按摩90',duration:90,buffer:10,price:0,trialPrice:null,active:true};
 // No fallback zero pay is invented when service setup is saved.
 const allocationInput={services:[service],technicians:[tech],locationIds:['bed'],occupied:[],date:'2026-11-03',startsAt:new Date('2026-11-03T01:00:00Z'),people:[{serviceId:'new90',preference:'ANY'}],hours:[{start:'08:00',end:'18:00'}],onUnavailable:(value:string)=>issue.push(value)};
 expect(allocateParty(allocationInput as unknown as Parameters<typeof allocateParty>[0])).toBeNull();
 expect(issue[0]).toContain('計酬設定');
});

it('prevents duplicate 60 minute names while preserving a different duration variant',async()=>{
 services=[{id:'existing60',name:'全身按摩60',duration:60}];
 expect(await saveBeautyNativeService({...input,name:'全身按摩60分鐘',duration:60})).toMatchObject({success:false,error:expect.stringContaining('已有相同服務')});
 expect(tx.beautyService.create).not.toHaveBeenCalled();
 expect(await saveBeautyNativeService(input)).toMatchObject({success:true});
});

it.each([undefined,{coachIds:[],expectedCoachIds:[]},{coachIds:['t'],expectedCoachIds:[]}])('creates without persisting a hidden JSON null compensation sentinel: %j',async rule=>{
 expect(await saveBeautyNativeService({...input,rule})).toMatchObject({success:true});
 expect(tx.beautyService.create.mock.lastCall?.[0].data).not.toHaveProperty('defaultRate');
 expect(services[0].defaultRate).toBeNull();
});

it('keeps compensation unchanged when multiple technicians are qualified for a new service',async()=>{
 tx.beautyTechnician.findMany.mockResolvedValueOnce([tech,{...tech,id:'t2'}]);
 expect(await saveBeautyNativeService({...input,rule:{coachIds:['t','t2'],expectedCoachIds:[]}})).toMatchObject({success:true,data:{sportsRule:{coachIds:['t','t2'],compensation:null}}});
 expect(tx.beautyTechnician.update.mock.calls.map(([args])=>args.where.id)).toEqual(['t','t2']);
 expect(tech.rates).toEqual({old60:{mode:'FIXED',value:300}});
});
