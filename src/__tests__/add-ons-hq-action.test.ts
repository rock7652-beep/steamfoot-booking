import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({admin:vi.fn(),permission:vi.fn(),store:vi.fn(),transaction:vi.fn(),read:vi.fn(),write:vi.fn(),remove:vi.fn(),audit:vi.fn(),lock:vi.fn(),invalidate:vi.fn(),select:vi.fn(),addonTx:vi.fn(),addonStore:vi.fn(),addonCatalog:vi.fn()}));
vi.mock('@/lib/addons-db',()=>({addonsPrisma:{$transaction:m.addonTx}}));
vi.mock('@/lib/addons-database-url',async()=>({...await vi.importActual('@/lib/addons-database-url'),addOnsDatabaseSelection:m.select}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:m.store},$transaction:m.transaction}}));
vi.mock('@/lib/session',()=>({requireAdminSession:m.admin}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/revalidation',()=>({revalidateStoreFeatureEntitlements:m.invalidate}));
vi.mock('@/server/services/operation-audit',()=>({recordOperationAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {saveStoreFeatureEntitlement} from '@/server/actions/store-feature-entitlement';
const tx={storeFeatureEntitlement:{findUnique:m.read,upsert:m.write,deleteMany:m.remove},$queryRaw:m.lock};
beforeEach(()=>{vi.resetAllMocks();m.select.mockReturnValue({role:'synthetic'});m.addonStore.mockResolvedValue({id:'s'});m.addonCatalog.mockResolvedValue(null);m.addonTx.mockImplementation(async work=>work({store:{findUnique:m.addonStore},serviceAddOnCatalog:{findFirst:m.addonCatalog}}));m.admin.mockResolvedValue({id:'hq-user',role:'ADMIN'});m.store.mockResolvedValue({id:'s',industryModule:'STEAMFOOT'});m.transaction.mockImplementation(async work=>work(tx));m.read.mockResolvedValue({status:'ENABLED',source:'MANUAL',startsAt:null,expiresAt:null});});
it.each(['ENABLED','HIDDEN','LOCKED','DISABLED','INHERIT'])('audits HQ %s atomically without deleting order history',async override=>{
 const form=new FormData();Object.entries({storeId:'s',featureKey:'add_ons',override}).forEach(([k,v])=>form.set(k,v));
 expect((await saveStoreFeatureEntitlement(form)).success).toBe(true);
 expect(m.permission).toHaveBeenCalledWith('staff.manage');expect(m.lock).toHaveBeenCalledOnce();
 expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({actorUserId:'hq-user',storeId:'s',targetId:'add_ons',action:'SET_ADD_ONS_FEATURE',before:expect.any(Object),after:expect.any(Object)}),tx);
 if(override==='INHERIT'){expect(m.remove).toHaveBeenCalledWith({where:{storeId:'s',featureKey:'add_ons'}});expect(m.write).not.toHaveBeenCalled();}
 else expect(m.write).toHaveBeenCalledWith(expect.objectContaining({update:expect.objectContaining({status:override})}));
 expect(m.invalidate).toHaveBeenCalledOnce();
});
it('does not report success or invalidate when audit persistence fails',async()=>{
 m.audit.mockRejectedValue(new Error('audit unavailable'));
 const form=new FormData();Object.entries({storeId:'s',featureKey:'add_ons',override:'HIDDEN'}).forEach(([k,v])=>form.set(k,v));
 expect((await saveStoreFeatureEntitlement(form)).success).toBe(false);expect(m.invalidate).not.toHaveBeenCalled();
});

it.each(['ENABLED','LOCKED','HIDDEN'])('supports independent beauty HQ %s without writing the goods key',async override=>{
 m.store.mockResolvedValue({id:'beauty',industryModule:'BEAUTY'});const form=new FormData();Object.entries({storeId:'beauty',featureKey:'beauty_service_add_ons',override}).forEach(([k,v])=>form.set(k,v));
 expect((await saveStoreFeatureEntitlement(form)).success).toBe(true);expect(m.write).toHaveBeenCalledWith(expect.objectContaining({where:{uq_store_feature_entitlement:{storeId:'beauty',featureKey:'beauty_service_add_ons'}}}));
});
it('rejects the beauty-only feature on other modules before writing',async()=>{const form=new FormData();Object.entries({storeId:'s',featureKey:'beauty_service_add_ons',override:'ENABLED'}).forEach(([k,v])=>form.set(k,v));expect((await saveStoreFeatureEntitlement(form)).success).toBe(false);expect(m.write).not.toHaveBeenCalled();});

it.each(['configuration','store-scope','catalog-read'])('does not enable or write entitlement when dedicated connection verification fails: %s',async failure=>{if(failure==='configuration')m.select.mockImplementation(()=>{throw new Error('configuration unavailable');});else if(failure==='store-scope')m.addonStore.mockResolvedValue(null);else m.addonCatalog.mockRejectedValue(new Error('catalog denied'));const form=new FormData();Object.entries({storeId:'s',featureKey:'add_ons',override:'ENABLED'}).forEach(([k,v])=>form.set(k,v));expect((await saveStoreFeatureEntitlement(form)).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(m.invalidate).not.toHaveBeenCalled();});
it('allows disabling without contacting the dedicated connection',async()=>{m.select.mockImplementation(()=>{throw new Error('offline');});const form=new FormData();Object.entries({storeId:'s',featureKey:'add_ons',override:'DISABLED'}).forEach(([k,v])=>form.set(k,v));expect((await saveStoreFeatureEntitlement(form)).success).toBe(true);expect(m.select).not.toHaveBeenCalled();expect(m.addonTx).not.toHaveBeenCalled();});
