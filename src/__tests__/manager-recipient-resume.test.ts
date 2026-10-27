import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),find:vi.fn(),update:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.store}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:async()=>'steamfoot'}));
vi.mock('@/lib/line-config',()=>({getLineConfigForStore:()=>({expectedBasicId:'@own-store'})}));
vi.mock('@/server/services/manager-notification-delivery',()=>({migrateManagerRecipients:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{storeLineNotificationRecipient:{findFirst:m.find,updateMany:m.update}}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {resumeStoreLineNotificationRecipient} from '@/server/actions/store-line-notification-recipients';
beforeEach(()=>{vi.resetAllMocks();m.permission.mockResolvedValue({id:'owner'});m.store.mockResolvedValue('a');m.find.mockResolvedValue({id:'r',lineUserId:null,linkedAt:null,bindingCode:'ABCDEF1234',bindingCodeExpiresAt:new Date('2099-01-01')});m.update.mockResolvedValue({count:1});});
it('reuses the pending recipient token without creating or enabling another record',async()=>{
 const result=await resumeStoreLineNotificationRecipient('r','a');expect(result.success).toBe(true);if(result.success){expect(decodeURIComponent(result.data.bindUrl)).toContain('@own-store');expect(decodeURIComponent(result.data.bindUrl)).toContain('綁定通知 ABCDEF1234');}
 expect(m.permission).toHaveBeenCalledWith('business_hours.manage');expect(m.find).toHaveBeenCalledWith({where:{id:'r',storeId:'a'}});expect(m.update).not.toHaveBeenCalled();
});
it('renews only an expired pending token, preserving identity and preferences',async()=>{m.find.mockResolvedValue({id:'r',lineUserId:null,linkedAt:null,bindingCode:'OLD',bindingCodeExpiresAt:new Date(0)});expect((await resumeStoreLineNotificationRecipient('r','a')).success).toBe(true);expect(m.update).toHaveBeenCalledWith({where:{id:'r',storeId:'a',lineUserId:null,linkedAt:null,bindingCode:'OLD'},data:{bindingCode:expect.stringMatching(/^[A-F0-9]{10}$/),bindingCodeExpiresAt:expect.any(Date)}});});
it.each(['wrong-store','bound','missing','denied'])('blocks %s resume requests',async mode=>{if(mode==='wrong-store')m.store.mockResolvedValue('b');if(mode==='bound')m.find.mockResolvedValue({lineUserId:'verified',linkedAt:new Date()});if(mode==='missing')m.find.mockResolvedValue(null);if(mode==='denied')m.permission.mockRejectedValue(new Error('FORBIDDEN'));expect((await resumeStoreLineNotificationRecipient('r','a')).success).toBe(false);expect(m.update).not.toHaveBeenCalled();});
