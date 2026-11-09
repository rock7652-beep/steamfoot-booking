import {beforeEach,expect,it,vi} from 'vitest';
import {AddOnsDatabaseConfigurationError} from '@/lib/addons-database-url';
const m=vi.hoisted(()=>({admin:vi.fn(),permission:vi.fn(),selection:vi.fn(),dedicated:vi.fn(),scopedStore:vi.fn(),catalog:vi.fn(),write:vi.fn(),store:vi.fn(),grant:vi.fn(),upsert:vi.fn(),remove:vi.fn(),audit:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/lib/session',()=>({requireAdminSession:m.admin}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/addons-database-url',async original=>({...await original<typeof import('@/lib/addons-database-url')>(),addOnsDatabaseSelection:m.selection}));
vi.mock('@/lib/addons-db',()=>({addonsPrisma:{$transaction:m.dedicated}}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:m.store},$transaction:m.write}}));
vi.mock('@/server/services/operation-audit',()=>({recordOperationAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:m.invalidate}));
vi.mock('@/lib/revalidation',()=>({revalidateStoreFeatureEntitlements:m.invalidate}));
import {saveStoreFeatureEntitlement} from '@/server/actions/store-feature-entitlement';
const tx={$queryRaw:vi.fn(),storeFeatureEntitlement:{findUnique:m.grant,upsert:m.upsert,deleteMany:m.remove}};
function input(status='ENABLED',feature='add_ons'){const f=new FormData();Object.entries({storeId:'beauty-store',featureKey:feature,override:status,source:'MANUAL'}).forEach(([k,v])=>f.set(k,v));return f;}
beforeEach(()=>{
 vi.resetAllMocks();m.admin.mockResolvedValue({id:'admin',role:'ADMIN'});m.permission.mockResolvedValue({});m.store.mockResolvedValue({id:'beauty-store',industryModule:'BEAUTY'});m.scopedStore.mockResolvedValue({id:'beauty-store'});m.catalog.mockResolvedValue(null);
 m.dedicated.mockImplementation(work=>work({store:{findUnique:m.scopedStore},serviceAddOnCatalog:{findFirst:m.catalog}}));m.write.mockImplementation(work=>work(tx));m.grant.mockResolvedValue(null);
});
it('rejects missing configuration before opening any connection or changing the entitlement',async()=>{
 m.selection.mockImplementation(()=>{throw new AddOnsDatabaseConfigurationError();});
 expect(await saveStoreFeatureEntitlement(input())).toEqual({success:false,error:'加購商品尚未完成專用連線設定，暫時無法啟用。'});
 expect(m.dedicated).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
it.each(['connection','catalog'])('rejects a failed %s read without granting access',async failure=>{
 if(failure==='connection')m.dedicated.mockRejectedValue(Error('private database details'));else m.catalog.mockRejectedValue(Error('private database details'));
 const result=await saveStoreFeatureEntitlement(input());expect(result).toMatchObject({success:false});expect(JSON.stringify(result)).not.toContain('private database details');expect(m.write).not.toHaveBeenCalled();
});
it('rejects a store outside the dedicated role scope',async()=>{
 m.scopedStore.mockResolvedValue(null);expect(await saveStoreFeatureEntitlement(input())).toMatchObject({success:false});expect(m.catalog).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
});
it('permits activation after the real dedicated reads, even for an empty new catalog',async()=>{
 expect(await saveStoreFeatureEntitlement(input())).toMatchObject({success:true});expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({update:expect.objectContaining({status:'ENABLED'})}));
 expect(m.dedicated.mock.invocationCallOrder[0]).toBeLessThan(m.write.mock.invocationCallOrder[0]);expect(m.audit).toHaveBeenCalledOnce();
});
it.each(['DISABLED','LOCKED','HIDDEN','INHERIT'])('keeps %s available while the dedicated connection is unavailable',async status=>{
 m.selection.mockImplementation(()=>{throw new AddOnsDatabaseConfigurationError();});expect(await saveStoreFeatureEntitlement(input(status))).toMatchObject({success:true});expect(m.selection).not.toHaveBeenCalled();expect(m.dedicated).not.toHaveBeenCalled();
});
it('does not couple independent beauty service activation to the goods connection',async()=>{
 m.selection.mockImplementation(()=>{throw new AddOnsDatabaseConfigurationError();});expect(await saveStoreFeatureEntitlement(input('ENABLED','beauty_service_add_ons'))).toMatchObject({success:true});expect(m.selection).not.toHaveBeenCalled();
});
it('checks HQ permission before probing the dedicated connection',async()=>{
 m.permission.mockRejectedValue(Error('permission denied'));expect(await saveStoreFeatureEntitlement(input())).toMatchObject({success:false});expect(m.selection).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
});
