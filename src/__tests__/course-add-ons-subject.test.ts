import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {Prisma} from '@prisma/client';
const m=vi.hoisted(()=>({industry:vi.fn(),music:vi.fn(),entitlement:vi.fn(),permission:vi.fn(),scope:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{storeFeatureEntitlement:{findFirst:m.entitlement}}}));
vi.mock('@/lib/industry-module-server',()=>({requireCourseStore:m.industry}));
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStoreFromEntitlements:m.music}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.permission}));
vi.mock('@/server/services/music-finance-access',()=>({readMusicFinanceScope:m.scope}));
vi.mock('@/server/services/shared-goods-availability',()=>({sharedGoodsAvailable:async()=>false}));
import {requireCourseAddOnModule,lockCourseAddOnSubject,readCourseAddOnCapabilities,readCourseAddOnSessionFields} from '@/server/services/course-add-ons';
const actor={id:'u',role:'OWNER',staffId:'staff'} as Parameters<typeof readCourseAddOnCapabilities>[0];
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('COURSE_ADD_ONS_ENABLED','1');m.industry.mockResolvedValue(undefined);m.music.mockResolvedValue(false);m.entitlement.mockResolvedValue({storeId:'s',startsAt:null,expiresAt:null});m.permission.mockResolvedValue(true);m.scope.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it.each([false,true])('resolves the authoritative course profile (music=%s)',async music=>{
 m.music.mockResolvedValue(music);
 expect(await requireCourseAddOnModule('s')).toBe(music?'MUSIC':'FITNESS');
 expect(m.entitlement).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'s',featureKey:music?'business.music':'business.fitness',status:'ENABLED'}}));
});
it.each([null,{startsAt:new Date('2099-01-01')},{expiresAt:new Date('2000-01-01')}])('denies missing, future and expired entitlement',async entitlement=>{
 m.entitlement.mockResolvedValue(entitlement);await expect(requireCourseAddOnModule('s')).rejects.toThrow('尚未開通');
 expect(await readCourseAddOnCapabilities(actor,'s')).toBeNull();
});
it('hides add-ons when disabled or financially restricted without breaking the roster',async()=>{
 vi.stubEnv('COURSE_ADD_ONS_ENABLED','0');expect(await readCourseAddOnSessionFields(actor,'s')).toEqual({});expect(m.industry).not.toHaveBeenCalled();
 vi.stubEnv('COURSE_ADD_ONS_ENABLED','1');m.music.mockResolvedValue(true);m.scope.mockResolvedValue(['teacher']);
 expect(await readCourseAddOnCapabilities(actor,'s')).toBeNull();
 m.scope.mockResolvedValue(null);expect(await readCourseAddOnCapabilities(actor,'s')).toEqual({storeId:'s',module:'MUSIC',canEdit:true,canCollect:true,canRefund:true,sharedGoods:false});
});
it('does not hide database failures as an empty catalog',async()=>{
 m.entitlement.mockRejectedValue(new Error('database unavailable'));
 await expect(readCourseAddOnCapabilities(actor,'s')).rejects.toThrow('database unavailable');
});
it('locks the store before the booking and binds store, session and booking together',async()=>{
 const person={id:'b',bookingId:'session',customerId:'c',status:'RESERVED',bookingStatus:'ACTIVE'};
 const query=vi.fn().mockResolvedValueOnce([{id:'s'}]).mockResolvedValueOnce([person]);
 expect(await lockCourseAddOnSubject({$queryRaw:query} as unknown as Prisma.TransactionClient,'s','session','b')).toEqual(person);
 expect(query.mock.calls[0].slice(1)).toEqual(['s']);expect(query.mock.calls[1].slice(1)).toEqual(['b','s','session']);
 const sql=(query.mock.calls[1][0] as TemplateStringsArray).join('?');
 expect(sql).toContain('s."storeId"=b."storeId"');expect(sql).toContain('FOR UPDATE OF b');expect(sql).toContain('s."cancelledAt"');
});
it('rejects a foreign or missing course booking before ledger access',async()=>{
 const query=vi.fn().mockResolvedValue([]);
 await expect(lockCourseAddOnSubject({$queryRaw:query} as unknown as Prisma.TransactionClient,'s','session','foreign')).rejects.toThrow('不屬於本店');
});
