import {expect,it,vi} from 'vitest';
import {beautyRequestCheck,beautyRequestStore,withBeautyReadScope,withBeautyCheckoutScope} from '@/server/beauty/request-scope';
import {permissionRequestSession} from '@/lib/permission-request-session';
it('shares only identical checks and exact actor/mode within one request',async()=>{
 const check=vi.fn(async()=>true),resolve=vi.fn(async()=>'store'),actor={};
 await withBeautyReadScope(async()=>{
  await Promise.all([beautyRequestCheck('customer.read',check),beautyRequestCheck('customer.read',check),beautyRequestCheck('wallet.read',check)]);
  await Promise.all([beautyRequestStore(actor,false,resolve),beautyRequestStore(actor,false,resolve)]);
  await beautyRequestStore(actor,true,resolve);await beautyRequestStore({},false,resolve);
 });
 expect(check).toHaveBeenCalledTimes(2);expect(resolve).toHaveBeenCalledTimes(3);
 await withBeautyReadScope(()=>beautyRequestCheck('customer.read',check));expect(check).toHaveBeenCalledTimes(3);
});
it('does not cache failed grants across requests, and checkout reauthenticates inside a read',async()=>{
 const auth=vi.fn(async()=>({id:'owner'}));
 await withBeautyReadScope(async()=>{
  await permissionRequestSession(auth);await permissionRequestSession(auth);
  await withBeautyCheckoutScope(()=>permissionRequestSession(auth));
 });expect(auth).toHaveBeenCalledTimes(2);
 const denied=vi.fn().mockRejectedValueOnce(Error('revoked')).mockResolvedValue(true);
 await withBeautyReadScope(async()=>{await expect(beautyRequestCheck('wallet',denied)).rejects.toThrow('revoked');await expect(beautyRequestCheck('wallet',denied)).rejects.toThrow('revoked');});
 expect(denied).toHaveBeenCalledTimes(1);await expect(withBeautyReadScope(()=>beautyRequestCheck('wallet',denied))).resolves.toBe(true);
});
