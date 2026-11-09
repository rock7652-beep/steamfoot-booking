import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),write:vi.fn(),readStore:vi.fn(),writeStore:vi.fn(),module:vi.fn(),membership:vi.fn(),musicFinance:vi.fn(),feature:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:m.transaction}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission,requireWritablePermission:m.write}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.readStore,resolveWriteStoreId:m.writeStore}));
vi.mock('@/server/services/course-add-ons',()=>({requireCourseAddOnModule:m.module,requireCourseAddOnMembership:m.membership,lockCourseAddOnSubject:vi.fn()}));
vi.mock('@/server/services/music-finance-access',()=>({requireMusicFinance:m.musicFinance}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/server/services/operation-audit',()=>({recordOperationAudit:vi.fn()}));
import {mutateCourseBookingAddOns,saveCourseAddOnCatalog,readCourseBookingAddOns} from '@/server/actions/course-add-ons';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('COURSE_ADD_ONS_ENABLED','1');vi.stubEnv('BOOKING_PARTICIPANTS_ENABLED','true');const user={id:'u',staffId:'staff',role:'OWNER'};m.permission.mockResolvedValue(user);m.write.mockResolvedValue(user);m.readStore.mockResolvedValue('s');m.writeStore.mockResolvedValue('s');m.module.mockResolvedValue('FITNESS');m.feature.mockResolvedValue(undefined);});
afterEach(()=>vi.unstubAllEnvs());
it('does not access data when rollout is off',async()=>{
 vi.stubEnv('COURSE_ADD_ONS_ENABLED','0');const r=await readCourseBookingAddOns({storeId:'s',bookingId:'b',participantId:'p'});
 expect(r.success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();expect(m.permission).not.toHaveBeenCalled();
});
it('rejects foreign store IDs before starting any transaction',async()=>{
 const r=await mutateCourseBookingAddOns({storeId:'foreign',bookingId:'b',participantId:'p',requestKey:crypto.randomUUID(),operation:'COLLECT',revision:1,amount:80,method:'OTHER'});
 expect(r.success).toBe(false);expect(m.write).toHaveBeenCalledWith('transaction.create');expect(m.transaction).not.toHaveBeenCalled();
});
it('requires separate refund permission and a supported module',async()=>{
 m.module.mockRejectedValue(new Error('wrong module'));
 const r=await mutateCourseBookingAddOns({storeId:'s',bookingId:'b',participantId:'p',requestKey:crypto.randomUUID(),operation:'REFUND',revision:1,amount:80,method:'OTHER',originalId:'sale'});
 expect(r.success).toBe(false);expect(m.write).toHaveBeenCalledWith('transaction.refund');expect(m.transaction).not.toHaveBeenCalled();
});
it('cannot bypass zero duration by submitting beauty module in a Steamfoot catalog request',async()=>{
 const r=await saveCourseAddOnCatalog({module:'BEAUTY',storeId:'s',revision:0,requestKey:crypto.randomUUID(),groups:[{id:'g',title:'加購',options:[{id:'x',name:'X',price:0,duration:10}]}]});
 expect(r.success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});

it('rejects restricted music finance scope before reading or writing the ledger',async()=>{
 m.module.mockResolvedValue('MUSIC');m.musicFinance.mockRejectedValue(new Error('restricted teacher scope'));
 const result=await readCourseBookingAddOns({storeId:'s',bookingId:'session',participantId:'booking'});
 expect(result.success).toBe(false);expect(m.musicFinance).toHaveBeenCalledWith(expect.anything(),'s','booking.read');expect(m.transaction).not.toHaveBeenCalled();
});

it('rejects a revoked or cross-store staff membership before ledger access',async()=>{
 m.membership.mockRejectedValue(new Error('本店工作權限已停用'));
 expect((await readCourseBookingAddOns({storeId:'s',bookingId:'session',participantId:'booking'})).success).toBe(false);
 expect(m.transaction).not.toHaveBeenCalled();
});

vi.mock('@/lib/addons-db',async()=>({addonsPrisma:(await vi.importMock<{prisma:unknown}>('@/lib/db')).prisma}));
