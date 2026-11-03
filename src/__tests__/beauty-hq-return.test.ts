import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({store:vi.fn(),manager:vi.fn(),redirect:vi.fn()}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.store}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager}));
vi.mock('next/navigation',()=>({redirect:m.redirect}));
import {beautyPageManager} from '@/server/beauty/page-access';
beforeEach(()=>{vi.resetAllMocks();m.redirect.mockImplementation(()=>{throw Error('NEXT_REDIRECT');});m.manager.mockResolvedValue({storeId:'beauty'});});
it('redirects HQ with no selected store before invoking store-only access',async()=>{
 m.store.mockResolvedValue(null);
 await expect(beautyPageManager({role:'ADMIN'})).rejects.toThrow('NEXT_REDIRECT');
 expect(m.redirect).toHaveBeenCalledWith('/hq/dashboard');expect(m.manager).not.toHaveBeenCalled();
});
it('retains the original manager guard for a selected HQ store',async()=>{
 m.store.mockResolvedValue('beauty');expect(await beautyPageManager({role:'ADMIN'})).toEqual({storeId:'beauty'});
 expect(m.manager).toHaveBeenCalledWith('booking.read');expect(m.redirect).not.toHaveBeenCalled();
});
it('does not replace a forbidden store selection with global HQ access',async()=>{
 m.store.mockRejectedValue(Error('forbidden store'));
 await expect(beautyPageManager({role:'ADMIN'})).rejects.toThrow('forbidden store');expect(m.redirect).not.toHaveBeenCalled();expect(m.manager).not.toHaveBeenCalled();
});
it('retains module denial for an authorized but non-beauty HQ store',async()=>{
 m.store.mockResolvedValue('music');m.manager.mockRejectedValue(Error('wrong module'));
 await expect(beautyPageManager({role:'ADMIN'})).rejects.toThrow('wrong module');expect(m.redirect).not.toHaveBeenCalled();
});
it.each(['OWNER','STAFF'])('keeps %s staff/store checks authoritative',async role=>{
 m.manager.mockRejectedValue(Error('staff denied'));
 await expect(beautyPageManager({role})).rejects.toThrow('staff denied');expect(m.store).not.toHaveBeenCalled();expect(m.redirect).not.toHaveBeenCalled();
});
