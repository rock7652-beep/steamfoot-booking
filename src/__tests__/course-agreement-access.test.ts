import {beforeEach, expect, it, vi} from 'vitest';
const mocks=vi.hoisted(()=>({permission:vi.fn(),manage:vi.fn(),read:vi.fn(),music:vi.fn(),fitness:vi.fn(),beauty:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:mocks.permission}));
vi.mock('@/lib/db',()=>({prisma:{storeFeatureEntitlement:{findFirst:mocks.fitness}}}));
vi.mock('@/server/services/course-access',()=>({courseManager:mocks.manage,courseManagerRead:mocks.read}));
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStoreFromEntitlements:mocks.music}));
vi.mock('@/server/beauty/access',()=>({beautyManager:mocks.beauty}));
import {requireCourseAgreementAccess} from '@/server/services/course-agreement-access';
beforeEach(()=>{vi.resetAllMocks();mocks.manage.mockResolvedValue({storeId:'a'});mocks.read.mockResolvedValue({storeId:'a',isChildStoreView:true});mocks.music.mockResolvedValue(true);vi.stubEnv('COURSE_AGREEMENTS_FITNESS_ENABLED','');});
it('reads retain resolved store and require both customer and rules access',async()=>{
 expect(await requireCourseAgreementAccess('read','a')).toMatchObject({storeId:'a',isChildStoreView:true});
 expect(mocks.read).toHaveBeenCalledWith('customer.read');expect(mocks.permission).toHaveBeenCalledWith('business_hours.view');
});
it('writes use the existing manager guard',async()=>{await requireCourseAgreementAccess('manage','a');expect(mocks.manage).toHaveBeenCalledWith('business_hours.manage');expect(mocks.read).not.toHaveBeenCalled();});
it('rejects stale or foreign store before entitlement access',async()=>{await expect(requireCourseAgreementAccess('read','b')).rejects.toThrow('門市已切換');expect(mocks.music).not.toHaveBeenCalled();});
it('rejects stores outside the music rollout',async()=>{mocks.music.mockResolvedValue(false);await expect(requireCourseAgreementAccess('manage')).rejects.toThrow('尚未開放課程約定');});
it('exports require explicit export permission',async()=>{mocks.permission.mockImplementation(async(p:string)=>{if(p==='customer.export')throw new Error('denied');});await expect(requireCourseAgreementAccess('export')).rejects.toThrow('denied');});
it('does not bypass the existing staff guard',async()=>{mocks.manage.mockRejectedValue(new Error('inactive staff'));await expect(requireCourseAgreementAccess('manage')).rejects.toThrow('inactive staff');expect(mocks.music).not.toHaveBeenCalled();});


it('keeps beauty writes behind the beauty module guard, independent flag and resolved store',async()=>{
 vi.stubEnv('BEAUTY_AGREEMENTS_ENABLED','');await expect(requireCourseAgreementAccess('manage','a','BEAUTY')).rejects.toThrow('尚未開放');expect(mocks.beauty).not.toHaveBeenCalled();
 vi.stubEnv('BEAUTY_AGREEMENTS_ENABLED','1');mocks.beauty.mockResolvedValue({storeId:'a',userId:'owner'});
 expect(await requireCourseAgreementAccess('manage','a','BEAUTY')).toMatchObject({storeId:'a',user:{id:'owner'},agreementProfile:'BEAUTY'});
 expect(mocks.beauty).toHaveBeenCalledWith('business_hours.manage',true);expect(mocks.manage).not.toHaveBeenCalled();
 await expect(requireCourseAgreementAccess('manage','b','BEAUTY')).rejects.toThrow('門市已切換');
});
it('requires beauty evidence and export permissions, never course membership',async()=>{
 vi.stubEnv('BEAUTY_AGREEMENTS_ENABLED','1');mocks.beauty.mockResolvedValue({storeId:'a',userId:'owner'});
 await requireCourseAgreementAccess('export','a','BEAUTY');expect(mocks.beauty).toHaveBeenCalledWith('customer.read',false);
 expect(mocks.permission).toHaveBeenCalledWith('business_hours.view');expect(mocks.permission).toHaveBeenCalledWith('customer.export');
 mocks.beauty.mockRejectedValue(new Error('not beauty store'));await expect(requireCourseAgreementAccess('read','a','BEAUTY')).rejects.toThrow('not beauty store');
});
