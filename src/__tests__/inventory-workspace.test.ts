// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import type { InventoryData } from "@/lib/inventory";
const mocks = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn() }));
vi.mock("@/server/actions/inventory", () => ({ loadInventory: mocks.load, saveOrder: mocks.save, savePayment: mocks.save, saveProduct: mocks.save, saveSupplier: mocks.save, saveStockCount: mocks.save }));
vi.mock("@/server/actions/customer", () => ({ createCustomer: vi.fn() }));
vi.mock("@/components/operation-history-button", () => ({ OperationHistoryButton: () => null }));
vi.mock("@/components/admin/modal-panel", () => ({ ModalPanel: ({ children }: {
        children: React.ReactNode;
    }) => createElement('section', null, children) }));
vi.mock("@/components/admin/exclusive-menu", () => ({ ExclusiveMenu: ({ children }: {
        children: React.ReactNode;
    }) => createElement('div', null, children) }));
import { InventoryWorkspace } from "@/app/(dashboard)/dashboard/inventory/workspace";
let root: Root, host: HTMLDivElement;
const initial: InventoryData = { store: { id: 'qa', name: '示範門市', phone: null, address: null }, canCost: false, canWrite: true, canManage: false, canExport: false, canCreateCustomer: false, products: [{ id: 'a', name: '保暖襪', stock: 20, price: 200, revision: 1, active: true }], suppliers: [], orders: [], payments: [], counts: [], customers: [{ id: 'c1', name: '陳怡君', phone: '0912345678' }, { id: 'c2', name: '陳怡君', phone: '0922333444' }, { id: 'c3', name: '林雅婷', phone: '0933555666' }] };
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); mocks.save.mockResolvedValue({ success: true }); mocks.load.mockResolvedValue({ success: true, data: initial }); act(() => root.render(createElement(InventoryWorkspace, { initial }))); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const click = (text: string) => { const b = [...host.querySelectorAll('button')].find(b => b.textContent === text); expect(b, text).toBeTruthy(); act(() => b!.click()); };
const fill = (input: HTMLInputElement, value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
it('filters receipt customers by either name or phone immediately', () => { click('收款單'); const input = host.querySelector('input[aria-label="顧客姓名或電話"]') as HTMLInputElement; fill(input, '陳怡君'); expect(host.textContent).toContain('0912345678'); expect(host.textContent).toContain('0922333444'); expect(host.textContent).not.toContain('林雅婷'); fill(input, '0922'); expect(host.textContent).not.toContain('0912345678'); expect(host.textContent).toContain('0922333444'); });
it('keeps cost reports and exports hidden without permissions', () => { expect(host.textContent).not.toContain('銷貨報表'); expect(host.textContent).not.toContain('進貨單'); click('商品與庫存'); expect(host.textContent).not.toContain('平均成本'); expect(host.querySelector('a[href="/api/inventory/export"]')).toBeNull(); });
it('keeps the same focused quantity input and date while editing rows', () => { click('＋ 新增銷貨'); const query = host.querySelector('input[aria-label="即時篩選商品"]') as HTMLInputElement; fill(query, '保暖'); click('保暖襪・庫存 20・$200　＋ 加入'); const date = host.querySelector('input[name="date"]') as HTMLInputElement; fill(date, '2026-10-02'); const qty = host.querySelector('input[aria-label="保暖襪 數量"]') as HTMLInputElement; qty.focus(); fill(qty, '2'); expect(host.querySelector('input[aria-label="保暖襪 數量"]')).toBe(qty); expect(document.activeElement).toBe(qty); expect(date.value).toBe('2026-10-02'); expect((host.querySelector('input[name="paid"]') as HTMLInputElement).value).toBe('400'); });
it('preserves tab search when switching away and back', () => { click('收款單'); const query = host.querySelector('input[aria-label="顧客姓名或電話"]') as HTMLInputElement; fill(query, '0922'); click('商品與庫存'); click('收款單'); expect((host.querySelector('input[aria-label="顧客姓名或電話"]') as HTMLInputElement).value).toBe('0922'); });
it('opens purchase records with supplier balances and batch payment permission', () => {
    const fixture: InventoryData = { ...initial, canCost: true, canManage: true, canPurchasePay: true, canWrite: false,
        suppliers: [{ id: 'v1', name: '測試供應商', phone: '0222222222', contact: '', address: '', active: true }],
        orders: [{ id: 'purchase-001', kind: 'PURCHASE', date: '2026-10-05', partyId: 'v1', partyName: '測試供應商', partyPhone: '0222222222', lines: [], freight: 0, delivery: '自取', channel: '', shippingNote: '', internalNote: '', total: 1000, paid: 400, revision: 2 }],
        payments: [{ id: 'payment-001', kind: 'PURCHASE', partyId: 'v1', partyName: '測試供應商', partyPhone: '0222222222', date: '2026-10-05', method: '現金', total: 400, allocations: [{ orderId: 'purchase-001', amount: 400, remainingAfter: 600 }] }],
    };
    act(() => root.render(createElement(InventoryWorkspace, { initial: fixture, key: 'purchase' })));
    click('進貨單'); click('收付款紀錄');
    expect(host.textContent).toContain('单據明細'.replace('单','單'));
    expect(host.textContent).toContain('應付');
    expect(host.textContent).toContain('$600');
    const pay = [...host.querySelectorAll('button')].find(b => b.textContent === '付款')!;
    expect(pay.disabled).toBe(false);
    click('付款');
    expect(host.querySelector('input[aria-label="HASE-001 收付款金額"]')).not.toBeNull();
});
it('disables collecting payment for a settled customer', () => {
    click('收款單'); const query = host.querySelector('input[aria-label="顧客姓名或電話"]') as HTMLInputElement; fill(query, '0912345678'); const row = host.querySelector('button[aria-label="陳怡君 0912345678 收款紀錄"]') as HTMLButtonElement; act(()=>row.click());
    const pay = [...host.querySelectorAll('button')].find(b => b.textContent === '收取未付款')!;
    expect(pay.disabled).toBe(true);
});
it("lets receiving staff enter items without exposing costs or supplier payments",()=>{
 act(()=>root.render(createElement(InventoryWorkspace,{initial:{...initial,canReceive:true},key:"receiving"})));
 click("進貨單");click("＋ 登錄收貨");
 expect(host.textContent).toContain("廠商・選填");
 expect(host.textContent).not.toContain("進貨成本");
 expect(host.textContent).not.toContain("確認成本");
 expect(host.textContent).not.toContain("廠商付款");
});
it("keeps supplier payment selection out of customer receipts",()=>{
 act(()=>root.render(createElement(InventoryWorkspace,{initial:{...initial,canCost:true,canManage:true,canPurchasePay:true},key:"receipt-only"})));
 click("收款單");
 expect(host.querySelector('[aria-label="收付款紀錄對象類型"]')).toBeNull();
 expect(host.textContent).not.toContain("廠商付款");
 expect(host.textContent).not.toContain("陳怡君");
});
const choose=(label:string,value:string)=>act(()=>{const select=host.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
const sale=(id:string,date:string):InventoryData['orders'][number]=>({id,kind:'SALE',date,partyId:'c1',partyName:'陳怡君',partyPhone:'0912345678',lines:[],freight:0,delivery:'自取',channel:'',shippingNote:'',internalNote:'',total:200,paid:0,revision:1});
it('excludes hidden selected orders from the batch payment preview',()=>{
 act(()=>root.render(createElement(InventoryWorkspace,{initial:{...initial,orders:[sale('sale-old','2026-09-01'),sale('sale-new','2026-10-05')]},key:'batch-filter'})));
 choose('批次收付款對象','c1');
 for(const box of host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))act(()=>box.click());
 click('批次收款（2）');click('關閉');
 fill(host.querySelector('input[aria-label="單據開始日期"]') as HTMLInputElement,'2026-10-01');
 click('批次收款（1）');
 expect(host.querySelector('input[aria-label="SALE-OLD 收付款金額"]')).toBeNull();
 expect(host.querySelector('input[aria-label="SALE-NEW 收付款金額"]')).not.toBeNull();
});
it('filters receipts by date method and actor without changing customer debt',()=>{
 const payments:InventoryData['payments']=[{id:'cash-001',kind:'SALE',partyId:'c1',partyName:'陳怡君',partyPhone:'0912345678',date:'2026-09-01',method:'現金',actorName:'員工甲',total:50,allocations:[]},{id:'bank-002',kind:'SALE',partyId:'c1',partyName:'陳怡君',partyPhone:'0912345678',date:'2026-10-05',method:'轉帳',actorName:'員工乙',total:100,allocations:[]}];
 act(()=>root.render(createElement(InventoryWorkspace,{initial:{...initial,orders:[sale('sale-new','2026-10-05')],payments},key:'receipt-filters'})));
 click('收款單');choose('收款方式篩選','轉帳');choose('收款人篩選','員工乙');
 fill(host.querySelector('input[aria-label="收款開始日期"]') as HTMLInputElement,'2026-10-01');click('查看');
 expect(host.textContent).toContain('BANK-002');expect(host.textContent).not.toContain('CASH-001');expect(host.textContent).toContain('符合條件共 1 筆');expect(host.textContent).toContain('$200');
});
it('hides the priced purchase entry for a receiving manager without cost permission',()=>{
 act(()=>root.render(createElement(InventoryWorkspace,{initial:{...initial,canManage:true,canReceive:true},key:'receive-manager'})));
 click('進貨單');expect(host.textContent).not.toContain('＋ 新增進貨');expect(host.textContent).toContain('＋ 登錄收貨');
});

it('starts a new sale at general price and switches configured category for all items',()=>{
 act(()=>root.render(createElement(InventoryWorkspace,{initial:{...initial,products:[{...initial.products[0],priceRatios:{STUDENT:80,FACULTY:70}}]},key:'prices'})));
 click('＋ 新增銷貨');expect((host.querySelector('[aria-label="身份價格"]') as HTMLSelectElement).value).toBe('GENERAL');
 fill(host.querySelector('[aria-label="即時篩選商品"]') as HTMLInputElement,'保暖');click('保暖襪・庫存 20・$200　＋ 加入');choose('身份價格','STUDENT');
 expect((host.querySelector('[aria-label="保暖襪 單價"]') as HTMLInputElement).value).toBe('160');expect((host.querySelector('[aria-label="保暖襪 單價"]') as HTMLInputElement).readOnly).toBe(true);
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);click('關閉');confirm.mockRestore();click('＋ 新增銷貨');expect((host.querySelector('[aria-label="身份價格"]') as HTMLSelectElement).value).toBe('GENERAL');
});
it('keeps manual pricing when category change is cancelled',()=>{
 act(()=>root.render(createElement(InventoryWorkspace,{initial:{...initial,canPriceOverride:true},key:'manual-price'})));click('＋ 新增銷貨');
 fill(host.querySelector('[aria-label="即時篩選商品"]') as HTMLInputElement,'保暖');click('保暖襪・庫存 20・$200　＋ 加入');fill(host.querySelector('[aria-label="保暖襪 單價"]') as HTMLInputElement,'150');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);choose('身份價格','FACULTY');expect(confirm).toHaveBeenCalled();expect((host.querySelector('[aria-label="身份價格"]') as HTMLSelectElement).value).toBe('GENERAL');expect((host.querySelector('[aria-label="保暖襪 單價"]') as HTMLInputElement).value).toBe('150');confirm.mockRestore();
});
it('lets a product manager edit basic metadata without exposing costs',()=>{
 act(()=>root.render(createElement(InventoryWorkspace,{initial:{...initial,canManage:true},key:'basic-product'})));click('商品與庫存');click('編輯商品');
 expect(host.querySelector('input[name="brand"]')).not.toBeNull();expect(host.querySelector('input[name="specification"]')).not.toBeNull();expect(host.querySelector('input[name="cost"]')).toBeNull();expect(host.textContent).not.toContain('平均成本');expect(host.querySelector('input[name="stock"]')).toBeNull();expect((host.querySelector('[aria-label="師資售價比例"]') as HTMLInputElement).readOnly).toBe(true);
});
it('filters product names by brand and keeps long metadata reachable',()=>{
 act(()=>root.render(createElement(InventoryWorkspace,{initial:{...initial,products:[{...initial.products[0],brand:'品牌甲',specification:'非常完整的規格名稱'}]},key:'brand'})));click('商品與庫存');fill(host.querySelector('[aria-label="搜尋商品"]') as HTMLInputElement,'品牌甲');expect(host.textContent).toContain('保暖襪');choose('商品品牌篩選','品牌甲');expect(host.querySelector('details summary')?.textContent).toContain('非常完整的規格名稱');
});
