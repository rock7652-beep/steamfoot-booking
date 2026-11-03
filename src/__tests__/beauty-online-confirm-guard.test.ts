import {afterEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {assertOnlineConfirmationSettled} from '@/server/beauty/online-confirm-guard';
import type {Tx} from '@/server/beauty/booking';
afterEach(()=>vi.unstubAllEnvs());
it('does not query the staged table when the feature is disabled',async()=>{
 vi.stubEnv('BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','');const query=vi.fn();
 await assertOnlineConfirmationSettled({$queryRaw:query} as unknown as Tx,'store',{orderId:'order'});
 expect(query).not.toHaveBeenCalled();
});
it('blocks correction or refund only while the related order or card remains unresolved',async()=>{
 vi.stubEnv('BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','1');const query=vi.fn().mockResolvedValueOnce([{requestKey:'request'}]).mockResolvedValueOnce([]),tx={$queryRaw:query} as unknown as Tx;
 await expect(assertOnlineConfirmationSettled(tx,'store',{orderId:'order'})).rejects.toThrow('尚未完成的核帳確認');
 await expect(assertOnlineConfirmationSettled(tx,'store',{cardId:'card'})).resolves.toBeUndefined();
 const args=query.mock.calls[0];expect(args.slice(1)).toContain('store');expect(args.slice(1)).toContain('order');
});
