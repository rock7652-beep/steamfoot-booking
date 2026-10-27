import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),update:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({storeLineNotificationRecipient:{findFirst:m.find,updateMany:m.update}})}}));
import {bindStoreLineNotificationRecipient} from '@/server/services/store-line-notification-binding';
const input={storeIds:['a','b'],lineUserId:'verified-line-subject',bindingCode:'ABCDEF1234'};
const row={id:'recipient-b',storeId:'b',displayName:'店長',bindingCodeExpiresAt:new Date('2099-01-01'),lineUserId:null,linkedAt:null};
beforeEach(()=>{vi.resetAllMocks();m.find.mockResolvedValueOnce(row).mockResolvedValueOnce(null);m.update.mockResolvedValue({count:1});});
it('binds the code-selected shared-account store, retaining unrelated preferences',async()=>{
 const result=await bindStoreLineNotificationRecipient(input);expect(result.storeId).toBe('b');expect(result.reply).toContain('已綁定成功');
 expect(m.find.mock.calls[0][0].where).toEqual({storeId:{in:['a','b']},bindingCode:'ABCDEF1234'});
 expect(m.update).toHaveBeenCalledWith({where:expect.objectContaining({id:'recipient-b',storeId:'b',bindingCode:'ABCDEF1234',lineUserId:null,linkedAt:null}),data:{lineUserId:'verified-line-subject',bindingCode:null,bindingCodeExpiresAt:null,linkedAt:expect.any(Date),isActive:true}});
});
it.each(['missing','expired','occupied','claimed','race'])('does not falsely enable a %s binding',async mode=>{
 m.find.mockReset();m.find.mockResolvedValueOnce(mode==='missing'?null:mode==='expired'?{...row,bindingCodeExpiresAt:new Date(0)}:mode==='claimed'?{...row,lineUserId:'other'}:row).mockResolvedValueOnce(mode==='occupied'?{id:'other'}:null);
 if(mode==='race')m.update.mockRejectedValue({code:'P2002'});
 const result=await bindStoreLineNotificationRecipient(input);expect(result.reply).not.toContain('已綁定成功');if(mode!=='race')expect(m.update).not.toHaveBeenCalled();
});
it('does not query for empty scope or malformed codes',async()=>{await bindStoreLineNotificationRecipient({...input,storeIds:[]});await bindStoreLineNotificationRecipient({...input,bindingCode:'not-code'});expect(m.find).not.toHaveBeenCalled();});
it('does not report success if another claim consumed the token first',async()=>{m.update.mockResolvedValue({count:0});expect((await bindStoreLineNotificationRecipient(input)).reply).not.toContain('已綁定成功');});
