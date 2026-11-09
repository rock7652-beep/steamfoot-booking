import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),write:vi.fn(),readStore:vi.fn(),writeStore:vi.fn(),module:vi.fn(),feature:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:m.transaction}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission,requireWritablePermission:m.write}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.readStore,resolveWriteStoreId:m.writeStore}));
vi.mock('@/lib/industry-module-server',()=>({requireSteamfootStore:m.module}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/server/services/operation-audit',()=>({recordOperationAudit:vi.fn()}));
import {mutateSteamfootParticipantAddOns,saveSteamfootAddOnCatalog,readSteamfootParticipantAddOns} from '@/server/actions/steamfoot-add-ons';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('STEAMFOOT_ADD_ONS_ENABLED','1');vi.stubEnv('BOOKING_PARTICIPANTS_ENABLED','true');const user={id:'u',staffId:'staff',role:'OWNER'};m.permission.mockResolvedValue(user);m.write.mockResolvedValue(user);m.readStore.mockResolvedValue('s');m.writeStore.mockResolvedValue('s');m.module.mockResolvedValue(undefined);m.feature.mockResolvedValue(undefined);});
afterEach(()=>vi.unstubAllEnvs());
it('does not access data when rollout is off',async()=>{
 vi.stubEnv('STEAMFOOT_ADD_ONS_ENABLED','0');const r=await readSteamfootParticipantAddOns({storeId:'s',bookingId:'b',participantId:'p'});
 expect(r.success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();expect(m.permission).not.toHaveBeenCalled();
});
it('rejects foreign store IDs before starting any transaction',async()=>{
 const r=await mutateSteamfootParticipantAddOns({storeId:'foreign',bookingId:'b',participantId:'p',requestKey:crypto.randomUUID(),operation:'COLLECT',revision:1,amount:80,method:'OTHER'});
 expect(r.success).toBe(false);expect(m.write).toHaveBeenCalledWith('transaction.create');expect(m.transaction).not.toHaveBeenCalled();
});
it('requires separate refund permission and a supported module',async()=>{
 m.module.mockRejectedValue(new Error('wrong module'));
 const r=await mutateSteamfootParticipantAddOns({storeId:'s',bookingId:'b',participantId:'p',requestKey:crypto.randomUUID(),operation:'REFUND',revision:1,amount:80,method:'OTHER',originalId:'sale'});
 expect(r.success).toBe(false);expect(m.write).toHaveBeenCalledWith('transaction.refund');expect(m.transaction).not.toHaveBeenCalled();
});
it('cannot bypass zero duration by submitting beauty module in a Steamfoot catalog request',async()=>{
 const r=await saveSteamfootAddOnCatalog({module:'BEAUTY',storeId:'s',revision:0,requestKey:crypto.randomUUID(),groups:[{id:'g',title:'加購',options:[{id:'x',name:'X',price:0,duration:10}]}]});
 expect(r.success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});

it('reports an unnamed disabled draft instead of falsely reporting nonzero duration',async()=>{
 const r=await saveSteamfootAddOnCatalog({storeId:'s',revision:0,requestKey:crypto.randomUUID(),groups:[{id:'g',title:'飲品加購',options:[{id:'blank',name:'',price:0,duration:0,active:false}]}]});
 expect(r.success).toBe(false);if(!r.success){expect(r.error).toContain('請填寫名稱');expect(r.error).not.toContain('時間');}expect(m.transaction).not.toHaveBeenCalled();
});

vi.mock('@/lib/addons-db',async()=>({addonsPrisma:(await vi.importMock<{prisma:unknown}>('@/lib/db')).prisma}));
