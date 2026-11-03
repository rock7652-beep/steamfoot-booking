import {beforeEach,expect,it,vi} from 'vitest';
import {hqStoreSwitchDestination} from '@/lib/hq-navigation';
const m=vi.hoisted(()=>({many:vi.fn(),raw:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{store:{findMany:m.many},$queryRaw:m.raw}}));
vi.mock('react',()=>({cache:<T>(fn:T)=>fn}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:vi.fn().mockResolvedValue(false)}));
const rows=[
 {id:'steam',industryModule:'STEAMFOOT',name:'蒸足店',operatingStatus:'ACTIVE',archivedAt:null},
 {id:'music',industryModule:'COURSE',name:'音樂店',operatingStatus:'ACTIVE',archivedAt:null},
 {id:'sports',industryModule:'COURSE',name:'運動店',operatingStatus:'TRIAL',archivedAt:null},
 {id:'beauty',industryModule:'BEAUTY',name:'美業店',operatingStatus:'ACTIVE',archivedAt:null},
 {id:'archived',industryModule:'BEAUTY',name:'封存美業',operatingStatus:'ACTIVE',archivedAt:'archived'},
 {id:'paused',industryModule:'BEAUTY',name:'暫停美業',operatingStatus:'PAUSED',archivedAt:null},
 {id:'retired',industryModule:'SPA',name:'舊 SPA',operatingStatus:'ACTIVE',archivedAt:null},
 {id:'future',industryModule:'UNSUPPORTED',name:'未知模組',operatingStatus:'ACTIVE',archivedAt:null},
].map(r=>({...r,slug:r.id,isDefault:false,parentStoreId:null,shopConfig:{address:null}}));
beforeEach(()=>{
 vi.clearAllMocks();
 m.many.mockImplementation(async({where={}})=>rows.filter(r=>
  (!where.industryModule||(!where.industryModule.in||where.industryModule.in.includes(r.industryModule))&&(!where.industryModule.not||where.industryModule.not!==r.industryModule))&&
  (!where.operatingStatus||where.operatingStatus.in.includes(r.operatingStatus))&&
  (!where.id||(typeof where.id==='string'?r.id===where.id:where.id.in.includes(r.id)))&&
  (!where.archivedAt||r.archivedAt!==null)));
 m.raw.mockImplementation(async(_strings,id)=>{const row=rows.find(r=>r.id===id);return row?[{industryModule:row.industryModule}]:[];});
});
it('one HQ admin discovers music, sports and Beauty without exposing archived or unsupported stores',async()=>{
 const {getStoreOptions}=await import('@/lib/store');
 const available=await getStoreOptions({id:'existing-admin',role:'ADMIN'});
 expect(available.map(r=>r.id)).toEqual(['steam','music','sports','beauty']);
});
it('selecting Beauty is authorized, resolves its real module and opens its own workspace',async()=>{
 const {resolveAuthorizedConcreteStore}=await import('@/lib/store');
 const {getStoreIndustryModule,requireCourseStore}=await import('@/lib/industry-module-server');
 expect(await resolveAuthorizedConcreteStore({id:'existing-admin',role:'ADMIN'},'beauty','switch')).toMatchObject({id:'beauty'});
 expect(await getStoreIndustryModule('beauty')).toBe('beauty');
 expect(hqStoreSwitchDestination('?view=plans&customerId=old&action=create&devicePreview=1','/hq/dashboard/courses','BEAUTY')).toBe('/hq/dashboard/beauty?devicePreview=1');
 await expect(requireCourseStore('beauty')).rejects.toMatchObject({code:'FORBIDDEN'});
});
it('a music staff member gains no access to Beauty from the HQ selector repair',async()=>{
 const {validateStoreAccess}=await import('@/lib/store');
 for(const mode of ['read','write','switch'] as const)await expect(validateStoreAccess({role:'STAFF',storeId:'music'},'beauty',mode)).rejects.toMatchObject({code:'FORBIDDEN'});
});
it.each(['paused','retired','future'])('HQ cannot switch to %s',async id=>{
 const {validateStoreAccess}=await import('@/lib/store');
 await expect(validateStoreAccess({role:'ADMIN'},id,'switch')).rejects.toMatchObject({code:'FORBIDDEN'});
});
it.each(['retired','future'])('runtime also rejects %s independently of menu visibility',async id=>{
 const {getStoreIndustryModule}=await import('@/lib/industry-module-server');
 await expect(getStoreIndustryModule(id)).rejects.toMatchObject({code:'FORBIDDEN'});
});
it('Beauty selection does not retain another store reservation, while course navigation remains supported',()=>{
 expect(hqStoreSwitchDestination('?tab=班表&date=2026-10-24&appointmentId=other','/hq/dashboard/beauty','BEAUTY')).toBe('/hq/dashboard/beauty');
 expect(hqStoreSwitchDestination('?view=plans','/hq/dashboard/courses','COURSE')).toBe('/hq/dashboard/courses?view=plans');
 expect(hqStoreSwitchDestination('?tab=班表','/hq/dashboard/beauty','STEAMFOOT')).toBe('/hq/dashboard');
});
