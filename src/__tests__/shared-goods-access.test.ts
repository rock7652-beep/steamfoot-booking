import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),write:vi.fn(),store:vi.fn(),industry:vi.fn(),module:vi.fn(),music:vi.fn(),feature:vi.fn(),gate:vi.fn(),subject:vi.fn(),save:vi.fn(),receipt:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:m.transaction}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission,requireWritablePermission:m.write}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.store,resolveWriteStoreId:m.store}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:m.industry,requireSteamfootStore:vi.fn()}));
vi.mock('@/server/services/course-add-ons',()=>({requireCourseAddOnModule:m.module,requireCourseAddOnMembership:vi.fn()}));
vi.mock('@/server/services/music-finance-access',()=>({requireMusicFinance:m.music}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/services/add-on-access',()=>({requireAddOnSelection:m.gate}));
vi.mock('@/server/services/shared-goods-subject',()=>({lockSharedGoodsSubject:m.subject}));
vi.mock('@/server/services/service-add-ons',()=>({saveAddOnOrder:m.save,postAddOnReceipt:m.receipt,addOnAuditEvidence:async(_tx:unknown,_a:unknown,_p:unknown,result:unknown)=>result,addOnCommand:async(_tx:unknown,_a:unknown,_key:unknown,_intent:unknown,work:()=>Promise<unknown>)=>work()}));
vi.mock('@/server/services/operation-audit',()=>({recordOperationAudit:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {mutateSharedGoods} from '@/server/actions/shared-goods';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('COURSE_ADD_ONS_ENABLED','1');vi.stubEnv('STEAMFOOT_ADD_ONS_ENABLED','1');vi.stubEnv('BOOKING_PARTICIPANTS_ENABLED','true');m.permission.mockResolvedValue({id:'u',staffId:'staff'});m.write.mockResolvedValue({id:'u',staffId:'staff'});m.store.mockResolvedValue('s');m.industry.mockResolvedValue('steamfoot');m.module.mockResolvedValue('FITNESS');m.transaction.mockImplementation(work=>work({$queryRaw:vi.fn()}));m.subject.mockResolvedValue({id:'p',ownership:'RESERVATION',reservationKey:'real-parent',bookingId:'b'});m.save.mockResolvedValue({id:'o',revision:1});m.receipt.mockResolvedValue({id:'r',amount:80});});
afterEach(()=>vi.unstubAllEnvs());
const input=()=>({storeId:'s',bookingId:'b',participantId:'p',operation:'SAVE',requestKey:crypto.randomUUID(),revision:0,catalogRevision:1,selections:[{id:'tea',quantity:2}]});
it('ignores browser owner/module claims and derives the reservation from an authorized anchor',async()=>{
 expect((await mutateSharedGoods({...input(),reservationKey:'foreign-parent',module:'BEAUTY'})).success).toBe(true);
 expect(m.subject).toHaveBeenCalledWith(expect.anything(),'s','STEAMFOOT','b','p');expect(m.save).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({module:'STEAMFOOT'}),expect.objectContaining({reservationKey:'real-parent'}),expect.objectContaining({selections:[{id:'tea',quantity:2}]}));
});
it('rejects foreign store, malformed quantities and unready beauty without writing',async()=>{
 expect((await mutateSharedGoods({...input(),storeId:'foreign'})).success).toBe(false);
 expect((await mutateSharedGoods({...input(),selections:[{id:'tea',quantity:0}]})).success).toBe(false);
 m.industry.mockResolvedValue('beauty');expect((await mutateSharedGoods(input())).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});
it('requires live new-purchase activation but keeps authorized refunds separate',async()=>{
 m.gate.mockRejectedValue(new Error('HQ關閉'));
 expect((await mutateSharedGoods(input())).success).toBe(false);expect(m.save).not.toHaveBeenCalled();
 m.gate.mockClear();expect((await mutateSharedGoods({...input(),operation:'REFUND',originalId:'sale',amount:80,method:'OTHER'})).success).toBe(true);
 expect(m.gate).not.toHaveBeenCalled();expect(m.write).toHaveBeenLastCalledWith('transaction.refund');expect(m.receipt).toHaveBeenCalledOnce();
});
it('rejects restricted music finance scope before any ledger transaction',async()=>{
 m.industry.mockResolvedValue('course');m.module.mockResolvedValue('MUSIC');m.music.mockRejectedValue(new Error('教師範圍受限'));
 expect((await mutateSharedGoods(input())).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});

vi.mock('@/lib/addons-db',async()=>({addonsPrisma:(await vi.importMock<{prisma:unknown}>('@/lib/db')).prisma}));
