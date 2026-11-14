// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),void:vi.fn(),saved:vi.fn(),cancel:vi.fn()}));
vi.mock('@/server/actions/customer-panel-records',()=>({getCustomerPanelWalletSessions:m.read}));
vi.mock('@/server/actions/wallet',()=>({voidWalletSession:m.void}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import {SteamPlanVoid} from '@/components/admin/steam-plan-void';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.read.mockResolvedValue({success:true,data:['AVAILABLE','RESERVED','COMPLETED','VOIDED'].map((status,i)=>({id:'session-'+i,sessionNo:i+1,status}))});m.void.mockResolvedValue({success:true,data:{walletId:'wallet',sessionNo:1}});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(customerId='customer'){await act(async()=>root.render(React.createElement(SteamPlanVoid,{key:customerId,customerId,walletId:'wallet',planName:'10堂',onSaved:m.saved,onCancel:m.cancel})));}
async function select(){const el=host.querySelector('select')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(el,'session-0');el.dispatchEvent(new Event('change',{bubbles:true}));});}
async function click(label:string){const el=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);expect(el).toBeTruthy();await act(async()=>el!.click());}
it('offers only available sessions and requires explicit reason and confirmation before writing',async()=>{
 await render();expect([...host.querySelectorAll('option')].map(o=>o.textContent)).toEqual(['請選擇','第 1 堂']);await select();expect(host.textContent).toContain('註銷第 1 堂');expect(m.void).not.toHaveBeenCalled();
 const input=host.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'店內核對');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await click('確認註銷');expect(m.void).toHaveBeenCalledExactlyOnceWith({sessionId:'session-0',reason:'店內核對'});expect(m.saved).toHaveBeenCalledOnce();
});
it('cancels from either the selector or the confirmation without a write',async()=>{
 await render();await click('取消');expect(m.cancel).toHaveBeenCalledOnce();await select();await click('取消');expect(m.cancel).toHaveBeenCalledTimes(2);expect(m.void).not.toHaveBeenCalled();
});
it('does not present a failed read as an empty wallet and can retry',async()=>{
 m.read.mockResolvedValueOnce({success:false,error:'權限查核失敗'});await render();expect(host.querySelector('[role="alert"]')?.textContent).toContain('權限查核失敗');expect(host.querySelector('select')).toBeNull();await click('重試');expect(host.querySelectorAll('option')).toHaveLength(2);expect(m.void).not.toHaveBeenCalled();
});
