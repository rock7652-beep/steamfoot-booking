// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('@/server/actions/wallet-session-correction',()=>({correctSteamWalletSession:m.save}));
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
import {WalletSessionCorrectionForm} from '@/components/admin/wallet-session-correction-form';
let host:HTMLDivElement,root:Root;
const saved=vi.fn(),cancel=vi.fn();
const session={id:'session',sessionNo:1,status:'BACKFILLED' as const,updatedAt:new Date('2026-11-11T02:00Z'),completedAt:new Date('2026-11-09T00:00Z'),voidedAt:null,voidReason:'原日期填錯',reservedAt:null,booking:null};
beforeEach(async()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.save.mockResolvedValue({success:true,data:{remainingAfter:10}});await act(async()=>root.render(React.createElement(WalletSessionCorrectionForm,{session,storeId:'store',customerId:'customer',walletId:'wallet',onSaved:saved,onCancel:cancel})));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function reason(value='日期修正'){await act(async()=>{const el=host.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
async function click(name:string){await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent===name)!.click();});}
it('requires a reason, identifies the original date, and reports success only after confirmation',async()=>{expect(host.textContent).toContain('2026/11/9');await click('確認更正返還');expect(m.save).not.toHaveBeenCalled();await reason();await click('確認更正返還');expect(m.save).toHaveBeenCalledWith(expect.objectContaining({expectedStatus:'BACKFILLED',expectedUpdatedAt:session.updatedAt.toISOString(),customerId:'customer',reason:'日期修正'}));expect(saved).toHaveBeenCalledOnce();});
it('retries the exact frozen request after a lost reply, locking edits and cancel',async()=>{m.save.mockRejectedValueOnce(Error('lost reply'));await reason();await click('確認更正返還');expect(saved).not.toHaveBeenCalled();expect(host.querySelector('textarea')!.disabled).toBe(true);expect([...host.querySelectorAll('button')].find(b=>b.textContent==='取消')!.disabled).toBe(true);await click('重試確認結果');expect(m.save.mock.calls[1][0]).toEqual(m.save.mock.calls[0][0]);expect(saved).toHaveBeenCalledOnce();});
it('prevents double clicks while pending and retains the reason after a conflict',async()=>{let resolve!:(value:unknown)=>void;m.save.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await reason();await act(async()=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent==='確認更正返還')!;b.click();b.click();});expect(m.save).toHaveBeenCalledOnce();await act(async()=>resolve({success:false,error:'此堂紀錄已更新'}));expect(host.querySelector('textarea')!.value).toBe('日期修正');expect(host.textContent).toContain('此堂紀錄已更新');expect(saved).not.toHaveBeenCalled();});
