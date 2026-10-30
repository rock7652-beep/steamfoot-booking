// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock("@/server/actions/beauty-collection-intent", () => ({ prepareBeautyCollectionPurchaseIntent: vi.fn(), readBeautyCollectionPurchaseIntent: vi.fn(), cancelBeautyCollectionPurchaseIntent: vi.fn(), acknowledgeBeautyCollectionPurchaseIntent: vi.fn() }));
const m=vi.hoisted(()=>({read:vi.fn(),collect:vi.fn()}));
vi.mock('@/server/actions/beauty',()=>({readBeautyCollection:m.read,collectBeautyPayment:m.collect}));
import {BeautyCollectionPanel} from '@/components/beauty/collection-panel';
const charge={id:'a',revision:1,personName:'合成甲',serviceName:'合成服務',price:1000,discount:{kind:'AMOUNT' as const,value:0},reduction:0,netPrice:1000,collected:0,due:1000};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.read.mockReset().mockResolvedValue({success:true,data:[charge]});m.collect.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const props={canDiscount:true,onClose:vi.fn(),onSaved:vi.fn(),onGuard:vi.fn()};
it('blocks submission and removes the previous customer while a different collection target is loading',async()=>{
 await act(async()=>root.render(h(BeautyCollectionPanel,{...props,ids:['a']})));
 const submit=host.querySelector<HTMLButtonElement>('button[type=submit]')??[...host.querySelectorAll('button')].find(b=>b.textContent==='確認收款')!;
 expect(submit.disabled).toBe(false);
 m.read.mockReturnValue(new Promise(()=>{}));
 await act(async()=>root.render(h(BeautyCollectionPanel,{...props,ids:['b']})));
 expect(m.read).toHaveBeenLastCalledWith(['b']);expect(m.collect).not.toHaveBeenCalled();
 expect.soft([...host.querySelectorAll('button')].find(b=>b.textContent==='確認收款')!.disabled,'previous customer payment must be disabled during target switch').toBe(true);
 expect.soft(host.textContent,'previous customer quote must not remain visible').not.toContain('合成甲');
});
it('does not submit the previous appointment when the selected target has changed',async()=>{
 await act(async()=>root.render(h(BeautyCollectionPanel,{...props,ids:['a']})));
 m.read.mockReturnValue(new Promise(()=>{}));m.collect.mockResolvedValue({success:true});
 await act(async()=>root.render(h(BeautyCollectionPanel,{...props,ids:['b']})));
 // This action is a Vitest mock only: no server, database, HTTP or money operation.
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.collect,'must wait for the selected target quote before accepting submission').not.toHaveBeenCalled();
});

it('ignores late quotes from a prior target and enables only the current quote',async()=>{
 let finishA!:(value:unknown)=>void,finishB!:(value:unknown)=>void;
 m.read.mockReturnValueOnce(new Promise(resolve=>{finishA=resolve;})).mockReturnValueOnce(new Promise(resolve=>{finishB=resolve;}));
 await act(async()=>root.render(h(BeautyCollectionPanel,{...props,ids:['a']})));
 await act(async()=>root.render(h(BeautyCollectionPanel,{...props,ids:['b']})));
 await act(async()=>finishB({success:true,data:[{...charge,id:'b',personName:'合成乙',price:800,netPrice:800,due:800}]}));
 await act(async()=>finishA({success:true,data:[charge]}));
 expect(host.textContent).toContain('合成乙');expect(host.textContent).not.toContain('合成甲');
 m.collect.mockResolvedValue({success:true});await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.collect).toHaveBeenCalledWith(expect.objectContaining({ids:['b'],amounts:[800]}));
});
it('rejects a mismatched authority quote without enabling payment',async()=>{
 m.read.mockResolvedValue({success:true,data:[charge]});await act(async()=>root.render(h(BeautyCollectionPanel,{...props,ids:['b']})));
 expect(host.textContent).toContain('收款對象不符');expect(host.textContent).not.toContain('合成甲');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='確認收款')!.disabled).toBe(true);expect(m.collect).not.toHaveBeenCalled();
});

it('keeps an in-flight collection open even when close is clicked in the same event batch',async()=>{
 const close=vi.fn();m.collect.mockReturnValue(new Promise(()=>{}));
 await act(async()=>root.render(h(BeautyCollectionPanel,{...props,onClose:close,ids:['a']})));
 await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));[...host.querySelectorAll('button')].find(b=>b.textContent==='關閉')!.click();});
 expect(m.collect).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();
});

it('completes a free trial or already settled service without inventing a payment',async()=>{m.read.mockResolvedValue({success:true,data:[{...charge,price:0,netPrice:0,due:0}]});const saved=vi.fn(),close=vi.fn();await act(async()=>root.render(h(BeautyCollectionPanel,{...props,onSaved:saved,onClose:close,ids:['a']})));expect(host.textContent).toContain('本次無待收款金額');const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='完成')!;expect(button.disabled).toBe(false);await act(async()=>button.click());expect(close).toHaveBeenCalledOnce();expect(saved).not.toHaveBeenCalled();expect(m.collect).not.toHaveBeenCalled();});
