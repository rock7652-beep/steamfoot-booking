import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),store:vi.fn(),module:vi.fn(),feature:vi.fn(),management:vi.fn(),raw:vi.fn(),catalog:vi.fn(),save:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:m.transaction}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.user,requireWritablePermission:m.user}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.store,resolveWriteStoreId:m.store}));
vi.mock('@/server/services/course-add-ons',()=>({requireCourseAddOnModule:m.module,requireCourseAddOnMembership:vi.fn()}));
vi.mock('@/server/services/music-finance-access',()=>({requireMusicFinance:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/services/add-on-access',()=>({requireAddOnManagement:m.management}));
vi.mock('@/server/services/service-add-ons',()=>({addOnCommand:async(_tx:unknown,_a:unknown,_key:unknown,_d:unknown,work:()=>Promise<unknown>)=>work()}));
vi.mock('@/server/services/operation-audit',()=>({recordOperationAudit:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {saveCourseAddOnCatalog} from '@/server/actions/course-add-ons';
const tx={$queryRaw:m.raw,serviceAddOnCatalog:{findUnique:m.catalog,upsert:m.save}};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('COURSE_ADD_ONS_ENABLED','1');m.user.mockResolvedValue({id:'u',staffId:'staff',role:'OWNER'});m.store.mockResolvedValue('s');m.module.mockResolvedValue('FITNESS');m.transaction.mockImplementation(work=>work(tx));m.catalog.mockResolvedValue(null);m.save.mockResolvedValue({revision:1,enabled:true});m.raw.mockImplementation(sql=>Promise.resolve(Array.isArray(sql)?[]:[{id:'A'}]));});
afterEach(()=>vi.unstubAllEnvs());
const input=()=>({storeId:'s',revision:0,enabled:true,requestKey:crypto.randomUUID(),groups:[{id:'g',title:'教材',subjectIds:['A'],options:[{id:'book',name:'教材',duration:0,price:0}]}]});
it('writes an A mapping atomically with the catalog under the independent permission',async()=>{
 expect((await saveCourseAddOnCatalog(input())).success).toBe(true);
 expect(m.user).toHaveBeenCalledWith('add_ons.manage');expect(m.management).toHaveBeenCalledWith(tx,'s');
 const sql=m.raw.mock.calls.find(([sql])=>!Array.isArray(sql))![0];expect(sql.values).toEqual(['s','A']);
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({storeId:'s',module:'FITNESS',groups:[expect.objectContaining({subjectIds:['A']})]})}));
});
it('rejects foreign or deleted A IDs without saving catalog changes',async()=>{
 m.raw.mockResolvedValue([]);const result=await saveCourseAddOnCatalog(input());
 expect(result.success).toBe(false);if(!result.success)expect(result.error).toContain('不屬於本店');expect(m.save).not.toHaveBeenCalled();
});
it('allows an explicitly unassigned group, never substitutes all A IDs',async()=>{
 const d=input();d.groups[0].subjectIds=[];expect((await saveCourseAddOnCatalog(d)).success).toBe(true);
 expect(m.raw).toHaveBeenCalledOnce();expect(m.save).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({groups:[expect.objectContaining({subjectIds:[]})]})}));
});

vi.mock('@/lib/addons-db',async()=>({addonsPrisma:(await vi.importMock<{prisma:unknown}>('@/lib/db')).prisma}));
