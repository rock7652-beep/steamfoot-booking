import { describe, expect, it, vi } from 'vitest';
import { memberPurchaseRecoveryTransport } from '@/lib/beauty-member-purchase-recovery-transport';

const key = '11111111-1111-4111-8111-111111111111';
const committed = { status: 'COMMITTED' as const, requestKey: key, purchaseId: 'order' };
function port() { return {
  prepare: vi.fn().mockResolvedValue({ success: true, data: { status: 'PREPARED', requestKey: key, purchaseId: null } }),
  read: vi.fn().mockResolvedValue({ success: true, data: committed }),
  cancel: vi.fn().mockResolvedValue({ success: true, data: { status: 'CANCELLED', requestKey: key, purchaseId: null } }),
  acknowledge: vi.fn().mockResolvedValue({ success: true, data: committed }),
}; }
describe('member online purchase recovery transport', () => {
  it('uses server-selected identity and scoped store for prepare, status and cancellation', async () => {
    const p = port(), t = memberPurchaseRecoveryTransport('store', p);
    const snapshot = { expectedName: '方案', expectedPrice: 500, expectedSessions: 5, expectedRevision: 3 };
    await t.prepare({ customerId: 'local-scope', planId: 'plan', lastFour: '1234', requestKey: '', ...snapshot }, key);
    expect(p.prepare).toHaveBeenCalledWith({ expectedStoreId: 'store', planId: 'plan', lastFour: '1234', requestKey: key, ...snapshot });
    await t.get('local-scope', key);
    expect(p.read).toHaveBeenLastCalledWith({ expectedStoreId: 'store', requestKey: key });
    await t.getPending('local-scope');
    expect(p.read).toHaveBeenLastCalledWith({ expectedStoreId: 'store' });
    await t.cancel('local-scope', key);
    expect(p.cancel).toHaveBeenCalledWith({ expectedStoreId: 'store', requestKey: key });
  });
  it('acknowledges only the specific server-confirmed order and checks the receipt', async () => {
    const p = port(), t = memberPurchaseRecoveryTransport('store', p);
    expect(await t.acknowledge('local-scope', key)).toEqual({ success: true, data: committed });
    expect(p.acknowledge).toHaveBeenCalledWith({ expectedStoreId: 'store', requestKey: key, purchaseId: 'order' });
    p.acknowledge.mockResolvedValueOnce({ success: true, data: { ...committed, purchaseId: 'wrong' } });
    expect((await t.acknowledge('local-scope', key)).success).toBe(false);
    p.read.mockResolvedValueOnce({ success: true, data: null });
    expect((await t.acknowledge('local-scope', key)).success).toBe(false);
    expect(p.acknowledge).toHaveBeenCalledTimes(2);
  });
});
