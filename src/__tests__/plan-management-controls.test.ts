// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
import {PlanManagementControls} from '@/components/admin/plan-management-controls';
import type {PlanManagementResult} from '@/lib/plan-management';
let host:HTMLDivElement,root:Root;
const save=vi.fn(),onSaved=vi.fn(),onPending=vi.fn(),onDirtyChange=vi.fn();
const card={id:'card',remaining:10,held:0,expiresAt:'2027-04-22T15:59:59.999Z',closed:false};
const success={success:true as const,data:{id:'card',remaining:0,expiresAt:card.expiresAt,closed:true}};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);save.mockResolvedValue(success);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(overrides:Partial<typeof card>={}){await act(async()=>{root.render(React.createElement(PlanManagementControls,{storeId:"store",card:{...card,...overrides},save,onSaved,onPending,onDirtyChange}));});}
async function click(text:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent===text);if(!b)throw Error('Missing button '+text);await act(async()=>b.click());}
async function reason(value='已與學員確認'){const input=host.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
it('requires a reason and confirms scope before closing without navigation',async()=>{
 await render();await click('註銷方案');expect(host.textContent).toContain('收回剩餘 10 堂');expect(host.textContent).toContain('不會自動退款');expect((host.querySelector('button.bg-primary-700') as HTMLButtonElement).disabled).toBe(true);
 await reason();await click('確認註銷');expect(save).toHaveBeenCalledWith(expect.objectContaining({cardId:'card',expectedStoreId:'store',expectedRemaining:10,operation:'close',reason:'已與學員確認'}));expect(onSaved).toHaveBeenCalledOnce();expect(onPending).toHaveBeenLastCalledWith(false);
});
it('keeps reserved plans unclosed and makes the blocking reason visible',async()=>{
 await render({held:1});await click('註銷方案');await reason();await click('確認註銷');expect(save).not.toHaveBeenCalled();expect(host.textContent).toContain('預約占用');
});
it('retries the same frozen request after a lost reply and blocks different edits',async()=>{
 save.mockRejectedValueOnce(Error('network interrupted'));await render();await click('註銷方案');await reason();await click('確認註銷');expect(host.querySelector('textarea')!.disabled).toBe(true);expect(onPending).toHaveBeenLastCalledWith(true);
 await click('重試確認結果');expect(save).toHaveBeenCalledTimes(2);expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);expect(onSaved).toHaveBeenCalledOnce();
});
it('ignores double submission while the first request is in flight',async()=>{
 let finish!:(value:PlanManagementResult)=>void;save.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));await render();await click('註銷方案');await reason();const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='確認註銷')!;
 await act(async()=>{button.click();button.click();});expect(save).toHaveBeenCalledOnce();await act(async()=>finish(success));expect(onSaved).toHaveBeenCalledOnce();
});
it('does not turn a confirmed save into an uncertain second write when refresh fails',async()=>{
 onSaved.mockImplementationOnce(()=>{throw Error('UI reload failed');});await render();await click('註銷方案');await reason();await click('確認註銷');expect(save).toHaveBeenCalledOnce();expect(host.textContent).toContain('已儲存');expect(host.textContent).not.toContain('重試確認結果');expect(onPending).toHaveBeenLastCalledWith(false);
});
it('supports closing a no-expiry plan and clears dirty state on explicit cancel',async()=>{
 await render({expiresAt:null as never});await click('註銷方案');await reason();expect(onDirtyChange).toHaveBeenLastCalledWith(true);await click('取消');expect(onDirtyChange).toHaveBeenLastCalledWith(false);expect(save).not.toHaveBeenCalled();await click('註銷方案');await reason();await click('確認註銷');expect(save.mock.calls[0][0].expectedExpiresAt).toBeNull();
});
