import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),write:vi.fn(),store:vi.fn(),feature:vi.fn(),allowed:vi.fn(),selection:vi.fn(),receipt:vi.fn(),order:vi.fn(),lock:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:m.transaction}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission,requireWritablePermission:m.write}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.store,resolveWriteStoreId:m.store}));
vi.mock('@/lib/industry-module-server',()=>({requireSteamfootStore:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature,hasStoreFeature:m.allowed}));
vi.mock('@/server/services/operation-audit',()=>({recordOperationAudit:vi.fn()}));
vi.mock('@/server/services/add-on-access',()=>({requireAddOnManagement:vi.fn(),requireAddOnSelection:m.selection}));
vi.mock('@/server/services/steamfoot-add-ons',()=>({lockAddOnSubject:m.lock,readAddOnOrder:m.order,saveSteamfootAddOnOrder:vi.fn(),postSteamfootAddOnReceipt:m.receipt,addOnCommand:async(_tx:unknown,_a:unknown,_key:unknown,_d:unknown,work:()=>Promise<unknown>)=>work()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {mutateSteamfootParticipantAddOns,readSteamfootParticipantAddOns} from '@/server/actions/steamfoot-add-ons';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('STEAMFOOT_ADD_ONS_ENABLED','1');vi.stubEnv('BOOKING_PARTICIPANTS_ENABLED','true');m.permission.mockResolvedValue({id:'u',staffId:'staff'});m.write.mockResolvedValue({id:'u',staffId:'staff'});m.store.mockResolvedValue('s');m.allowed.mockResolvedValue(false);m.transaction.mockImplementation(work=>work({$queryRaw:vi.fn(),serviceAddOnOrder:{findUnique:vi.fn().mockResolvedValue({items:[]})}}));m.lock.mockResolvedValue({id:'p'});m.selection.mockRejectedValue(new Error('HQ關閉'));m.receipt.mockResolvedValue({id:'receipt',amount:80});m.order.mockResolvedValue({order:{id:'old-order',items:[],revision:1,total:80},receipts:[],collected:0,editable:true,groups:[],catalogRevision:1});});
afterEach(()=>vi.unstubAllEnvs());
const input={storeId:'s',bookingId:'b',participantId:'p',revision:1,amount:80,method:'OTHER'};
it.each(['COLLECT','REFUND'] as const)('keeps existing-order %s available when HQ new selection is closed',async operation=>{
 const result=await mutateSteamfootParticipantAddOns({...input,requestKey:crypto.randomUUID(),operation,...(operation==='REFUND'?{originalId:'sale'}:{})});
 expect(result.success).toBe(true);expect(m.selection).not.toHaveBeenCalled();expect(m.receipt).toHaveBeenCalledOnce();
 expect(m.write).toHaveBeenCalledWith(operation==='REFUND'?'transaction.refund':'transaction.create');
});
it('rejects new selection while preserving readable historical items',async()=>{
 const result=await mutateSteamfootParticipantAddOns({...input,requestKey:crypto.randomUUID(),operation:'SAVE',ids:['tea'],catalogRevision:1});
 expect(result.success).toBe(false);expect(m.receipt).not.toHaveBeenCalled();
 const history=await readSteamfootParticipantAddOns(input);
 expect(history.success).toBe(true);if(history.success){expect(history.data.order?.id).toBe('old-order');expect(history.data.canSelect).toBe(false);}
});

vi.mock('@/lib/addons-db',async()=>({addonsPrisma:(await vi.importMock<{prisma:unknown}>('@/lib/db')).prisma}));
