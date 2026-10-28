// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ read: vi.fn(), prepare: vi.fn(), cancel: vi.fn(), ack: vi.fn(), submit: vi.fn() }));
vi.mock('@/server/actions/beauty-member-purchase-intent', () => ({
  readBeautyMemberPurchaseIntent: m.read, prepareBeautyMemberPurchaseIntent: m.prepare,
  cancelBeautyMemberPurchaseIntent: m.cancel, acknowledgeBeautyMemberPurchaseIntent: m.ack,
}));
vi.mock('@/server/actions/beauty', () => ({ requestBeautyPlan: m.submit }));
import { BeautyMemberPurchaseRecovery } from '@/components/beauty/member-purchase-recovery';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const roots: { root: ReturnType<typeof createRoot>; host: HTMLDivElement }[] = [];
const key = '11111111-1111-4111-8111-111111111111';
const prepared = { status: 'PREPARED', requestKey: key, purchaseId: null };
const committed = { status: 'COMMITTED', requestKey: key, purchaseId: 'order' };
const props = { storeId: 'store', customerId: 'customer', scopeKey: 'user', plan: { id: 'plan-b', name: '其他方案 B', price: 800, sessions: 8, revision: 3 }, bank: { bankName: '銀行', bankCode: '000', bankAccountNumber: '123456' }, onClose: vi.fn(), onSubmitted: vi.fn() };
function button(host: HTMLElement, label: string) { const element = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label); if (!element) throw new Error('missing button: ' + label); return element; }
async function mount(override: Partial<React.ComponentProps<typeof BeautyMemberPurchaseRecovery>> = {}) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push({ root, host }); await act(async () => { root.render(h(BeautyMemberPurchaseRecovery, { ...props, ...override })); }); return host; }
beforeEach(() => { vi.clearAllMocks(); window.sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.spyOn(crypto, 'randomUUID').mockReturnValue(key); m.read.mockResolvedValue({ success: true, data: null }); });
afterEach(() => { for (const { root, host } of roots.splice(0)) { act(() => root.unmount()); host.remove(); } vi.restoreAllMocks(); });

it('recovers a completed original request after reload without presenting the currently selected plan as that order', async () => {
  window.sessionStorage.setItem('purchase-intent:v1:beauty-member%3Auser:store:customer', JSON.stringify({ v: 1, requestKey: key }));
  m.read.mockResolvedValue({ success: true, data: committed });
  m.ack.mockResolvedValue({ success: true, data: committed });
  const host = await mount();
  expect(host.textContent).toContain('原申請已送出');
  expect(host.textContent).not.toContain('其他方案 B');
  expect(button(host, '已匯款，送出核帳資料').disabled).toBe(true);
  await act(async () => button(host, '我已了解').click());
  expect(m.ack).toHaveBeenCalledWith({ expectedStoreId: 'store', requestKey: key, purchaseId: 'order' });
  expect(props.onSubmitted).toHaveBeenCalledOnce();
  expect(window.sessionStorage.length).toBe(0);
});

it('keeps only the request key and recovers a committed order after the response is lost', async () => {
  let server: typeof prepared | typeof committed | null = null;
  m.read.mockImplementation(async () => ({ success: true, data: server }));
  m.prepare.mockImplementation(async () => { server = prepared; return { success: true, data: prepared }; });
  m.submit.mockImplementation(async () => { server = committed; throw new Error('response dropped'); });
  const host = await mount();
  const input = host.querySelector('input[aria-label="轉出帳號後四碼"]') as HTMLInputElement;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '1234'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => button(host, '已匯款，送出核帳資料').click());
  expect(m.submit).toHaveBeenCalledOnce();
  const expected = { expectedName: '其他方案 B', expectedPrice: 800, expectedSessions: 8, expectedRevision: 3, planId: 'plan-b', lastFour: '1234', requestKey: key };
  expect(m.prepare).toHaveBeenCalledWith({ ...expected, expectedStoreId: 'store' });
  expect(m.submit).toHaveBeenCalledWith(expected);
  expect(host.textContent).toContain('查看最新核帳狀態');
  const saved = window.sessionStorage.getItem('purchase-intent:v1:beauty-member%3Auser:store:customer');
  expect(JSON.parse(saved!)).toEqual({ v: 1, requestKey: key });
  expect(saved).not.toContain('1234');
  expect(button(host, '已匯款，送出核帳資料').disabled).toBe(true);
});

it('keeps an unconfirmed key and shows the changed-plan error without sending the order', async () => {
  m.prepare.mockResolvedValue({ success: false, error: '方案資料已變更，請重新核對' });
  const host = await mount();
  const input = host.querySelector('input[aria-label="轉出帳號後四碼"]') as HTMLInputElement;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '1234'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => button(host, '已匯款，送出核帳資料').click());
  expect(host.textContent).toContain('方案資料已變更，請重新核對');
  expect(m.submit).not.toHaveBeenCalled();
  expect(JSON.parse(window.sessionStorage.getItem('purchase-intent:v1:beauty-member%3Auser:store:customer')!)).toEqual({ v: 1, requestKey: key });
  expect(button(host, '已匯款，送出核帳資料').disabled).toBe(true);
});

it('treats cancellation that lost a race to a committed order as submitted', async () => {
  window.sessionStorage.setItem('purchase-intent:v1:beauty-member%3Auser:store:customer', JSON.stringify({ v: 1, requestKey: key }));
  m.read.mockResolvedValue({ success: true, data: prepared });
  m.cancel.mockResolvedValue({ success: true, data: committed });
  const host = await mount();
  expect(host.textContent).toContain('未必是原申請');
  await act(async () => button(host, '取消原申請').click());
  expect(host.textContent).toContain('原申請已送出');
  expect(host.textContent).not.toContain('原申請已取消');
});

it('recovers or cancels a prepared request without an available plan', async () => {
  window.sessionStorage.setItem('purchase-intent:v1:beauty-member%3Auser:store:customer', JSON.stringify({ v: 1, requestKey: key }));
  m.read.mockResolvedValue({ success: true, data: prepared });
  m.cancel.mockResolvedValue({ success: true, data: { status: 'CANCELLED', requestKey: key, purchaseId: null } });
  const host = await mount({ plan: null });
  expect(host.textContent).toContain('購買申請狀態');
  expect(host.textContent).not.toContain('其他方案 B');
  await act(async () => button(host, '取消原申請').click());
  expect(host.textContent).toContain('原申請已取消');
});

it('can acknowledge a completed order without any available plan', async () => {
  m.read.mockResolvedValue({ success: true, data: committed });
  m.ack.mockResolvedValue({ success: true, data: committed });
  const host = await mount({ plan: null });
  expect(host.textContent).toContain('原申請已送出');
  await act(async () => button(host, '我已了解').click());
  expect(m.ack).toHaveBeenCalledOnce();
  expect(props.onSubmitted).toHaveBeenCalledOnce();
});
