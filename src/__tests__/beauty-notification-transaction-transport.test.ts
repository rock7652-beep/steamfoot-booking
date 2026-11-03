import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ plan: vi.fn(), quota: vi.fn(), central: vi.fn(), route: vi.fn(), push: vi.fn(), blocked: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get() { throw Error('A second main-pool checkout would deadlock'); } }) }));
vi.mock('@/lib/runtime-env', () => ({ isPreviewExternalIntegrationBlocked: m.blocked }));
vi.mock('@/lib/store-plan', () => ({ getStoreForPlanByStoreId: m.plan }));
vi.mock('@/lib/usage-gate', () => ({ checkReminderSendLimit: m.quota }));
vi.mock('@/server/services/central-line-recipient-loader', () => ({ resolveCentralLineRecipientForCustomer: m.central }));
vi.mock('@/server/services/verified-reminder-line-route', () => ({ resolveVerifiedReminderLineRoute: m.route }));
vi.mock('@/lib/line', () => ({ pushMessage: m.push, pushSteamButlerMessage: m.push }));
import { deliverCourseCardNotification } from '@/server/services/course-card-notification-delivery';
const tx = { messageLog: { count: vi.fn(), update: vi.fn() } };
beforeEach(() => { vi.resetAllMocks(); m.blocked.mockReturnValue(false); m.plan.mockResolvedValue({ plan: 'PROFESSIONAL' }); m.quota.mockReturnValue({ allowed: true }); m.central.mockResolvedValue({ deliverable: true }); m.route.mockResolvedValue({ status: 'READY', channel: 'STORE', recipientLineUserId: 'verified-buyer' }); m.push.mockResolvedValue({ success: true }); });
it('passes the same transaction to quota, central identity and store identity reads', async () => {
    const person = { id: 'buyer', lineUserId: 'legacy', lineLinkStatus: 'LINKED' };
    expect(await deliverCourseCardNotification(tx as unknown as Parameters<typeof deliverCourseCardNotification>[0], { id: 'notice', storeId: 'store', person, messages: [{ type: 'text', text: '通知' }], retryKey: 'key', now: new Date(), transactionScoped: true })).toBe('SENT');
    expect(m.plan).toHaveBeenCalledWith('store', tx);
    expect(m.central).toHaveBeenCalledWith('buyer', 'store', tx);
    expect(m.route).toHaveBeenCalledWith('store', 'legacy', { deliverable: true }, 'buyer', tx);
    expect(m.push.mock.calls[0][1]).toBe('verified-buyer');
});
it('never sends when the verified identity is blocked', async () => {
    m.route.mockResolvedValue({ status: 'BLOCKED', reason: 'IDENTITY_UNCONFIRMED' });
    expect(await deliverCourseCardNotification(tx as unknown as Parameters<typeof deliverCourseCardNotification>[0], { id: 'notice', storeId: 'store', person: { id: 'buyer', lineUserId: null, lineLinkStatus: 'UNLINKED' }, messages: [], retryKey: 'key', now: new Date(), transactionScoped: true })).toBe('SKIPPED');
    expect(m.push).not.toHaveBeenCalled();
});
it('includes other pending reservations in the shared monthly quota', async () => {
    tx.messageLog.count.mockResolvedValue(7);
    await deliverCourseCardNotification(tx as unknown as Parameters<typeof deliverCourseCardNotification>[0], { id: 'notice', storeId: 'store', person: { id: 'buyer', lineUserId: null, lineLinkStatus: 'UNLINKED' }, messages: [], retryKey: 'key', now: new Date('2026-10-25T15:00Z'), transactionScoped: true });
    expect(tx.messageLog.count).toHaveBeenCalledWith({ where: expect.objectContaining({ id: { not: 'notice' }, OR: [expect.objectContaining({ status: 'SENT' }), expect.objectContaining({ status: 'PENDING' })] }) });
    expect(m.quota).toHaveBeenCalledWith({ plan: 'PROFESSIONAL' }, 7);
});
it.each([{ result: { success: false, error: 'timeout' }, status: 'PENDING' }, { result: { success: false, httpStatus: 400, error: 'rejected', errorType: 'line_api_rejected' }, status: 'FAILED' }])('retains quota for uncertain delivery: $status', async ({ result, status }) => {
    m.push.mockResolvedValue(result);
    await deliverCourseCardNotification(tx as unknown as Parameters<typeof deliverCourseCardNotification>[0], { id: 'notice', storeId: 'store', person: { id: 'buyer', lineUserId: null, lineLinkStatus: 'UNLINKED' }, messages: [], retryKey: 'key', now: new Date(), transactionScoped: true });
    expect(tx.messageLog.update).toHaveBeenCalledWith({ where: { id: 'notice' }, data: expect.objectContaining({ status }) });
});
