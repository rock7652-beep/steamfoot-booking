// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
import {PlanManagementControls} from '@/components/admin/plan-management-controls';
import type {SessionAdjustmentInput,SessionAdjustmentRecord,SessionAdjustmentResult} from '@/lib/plan-session-adjustment';
let host:HTMLDivElement,root:Root;
const save=vi.fn(),saved=vi.fn(),dirty=vi.fn(),pending=vi.fn();
const card={id:'card',remaining:10,held:2,expiresAt:'2027-12-31T15:59:59.999Z',closed:false};
const makeRecord=(d:SessionAdjustmentInput):SessionAdjustmentRecord=>({id:d.requestKey,cardId:d.cardId,customerId:d.customerId,customerName:'學員',operation:d.operation,quantity:d.quantity,occurredOn:d.occurredOn??null,reason:d.reason,recordedAt:'2026-10-30T04:00:00Z',actorName:'店長',reversalOf:d.reversalOf??null,remainingBefore:d.expectedRemaining,remainingAfter:d.expectedRemaining+(d.operation==='REVERSE'?d.quantity:-d.quantity)});
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);save.mockImplementation(async(d:SessionAdjustmentInput)=>({success:true,data:{record:makeRecord(d),remaining:makeRecord(d).remainingAfter,expiresAt:card.expiresAt}}));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(records:SessionAdjustmentRecord[]=[],members=[{id:'learner',name:'學員'}]){await act(async()=>root.render(React.createElement(PlanManagementControls,{storeId:'store',card,save:vi.fn(),onSaved:saved,onDirtyChange:dirty,onPending:pending,sessionAdjustment:{save,records,members}})));await click('調整堂數');}
async function click(label:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent===label);if(!b)throw Error('Missing '+label);await act(async()=>b.click());}
async function set(label:string,value:string){const e=host.querySelector(`[aria-label="${label}"]`)!;await act(async()=>{Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(e,value);e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
it('backfills with a required actual date, optional reason, immediate balance and no navigation',async()=>{
  await render();expect(host.textContent).toContain('目前可調整 8 堂');expect((host.querySelector('button.bg-primary-700') as HTMLButtonElement).disabled).toBe(true);
  await set('實際上課日期','2026-01-02');await click('確認調整');
  expect(save).toHaveBeenCalledWith(expect.objectContaining({operation:'BACKFILL',quantity:1,reason:'',occurredOn:'2026-01-02',expectedRemaining:10}));
  expect(host.textContent).toContain('剩餘 9 堂');expect(host.textContent).toContain('實際上課：2026-01-02');expect(host.textContent).toContain('店長');expect(saved).toHaveBeenCalledOnce();
});
it('voids without class date or mandatory reason and blocks held quota',async()=>{
  await render();await set('調整類型','VOID');expect(host.querySelector('[aria-label="實際上課日期"]')).toBeNull();
  await set('調整數量','9');await click('確認調整');expect(save).not.toHaveBeenCalled();
  await set('調整數量','2');await click('確認調整');expect(save).toHaveBeenCalledWith(expect.objectContaining({operation:'VOID',quantity:2,reason:''}));
});
it('freezes the exact command after a lost reply and blocks edits, closing and repeated clicks',async()=>{
  save.mockRejectedValueOnce(Error('lost response'));await render();await set('調整類型','VOID');await click('確認調整');
  expect((host.querySelector('[aria-label="調整數量"]') as HTMLInputElement).disabled).toBe(true);
  const cancel=[...host.querySelectorAll('button')].find(b=>b.textContent==='取消')!;expect(cancel.disabled).toBe(true);
  expect(pending).toHaveBeenLastCalledWith(true);await click('重試確認結果');
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);expect(pending).toHaveBeenLastCalledWith(false);expect(saved).toHaveBeenCalledOnce();
});
it('requires shared-card learner selection and makes reversal scope explicit',async()=>{
  const record=makeRecord({expectedStoreId:'store',cardId:'card',requestKey:'old',customerId:'learner',operation:'BACKFILL',quantity:2,expectedRemaining:12,expectedExpiresAt:card.expiresAt,occurredOn:'2026-01-02',reason:''});
  await render([record],[{id:'learner',name:'學員'},{id:'other',name:'另一位'}]);
  expect((host.querySelector('button.bg-primary-700') as HTMLButtonElement).disabled).toBe(true);
  await click('更正返還');expect(host.textContent).toContain('返還 2 堂');await click('確認更正返還');
  expect(save).toHaveBeenCalledWith(expect.objectContaining({operation:'REVERSE',reversalOf:'old',customerId:'learner',quantity:2,reason:''}));
  expect(host.textContent).toContain('（已更正）');expect(host.textContent).toContain('剩餘 12 堂');
});
it('ignores duplicate submission while pending and retains the draft on a definitive rejection',async()=>{
  let resolve!:(r:SessionAdjustmentResult)=>void;save.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  await render();await set('調整類型','VOID');const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='確認調整')!;
  await act(async()=>{button.click();button.click();});expect(save).toHaveBeenCalledOnce();
  await act(async()=>resolve({success:false,error:'堂數已更新，請核對'}));
  expect(host.textContent).toContain('堂數已更新');expect((host.querySelector('[aria-label="調整類型"]') as HTMLSelectElement).value).toBe('VOID');expect(saved).not.toHaveBeenCalled();
});

const duplicate={token:'a'.repeat(64),date:'2026-01-02',existingQuantity:1};
it('requires an explicit second confirmation for a possible duplicate and freezes it across a lost reply',async()=>{
  save.mockResolvedValueOnce({success:false,error:'請先核對',duplicateReview:duplicate}).mockRejectedValueOnce(Error('lost reply'));
  await render();await set('實際上課日期','2026-01-02');await click('確認調整');
  expect(save).toHaveBeenCalledTimes(1);expect(saved).not.toHaveBeenCalled();expect(host.textContent).toContain('疑似重複補登');expect(host.textContent).toContain('已有 1 堂扣堂紀錄');
  expect(save.mock.calls[0][0]).not.toHaveProperty('duplicateAcknowledgement');
  await click('確認為另一堂，仍要補登');
  expect(save.mock.calls[1][0]).toEqual({...save.mock.calls[0][0],duplicateAcknowledgement:duplicate.token});
  expect((host.querySelector('[aria-label="實際上課日期"]') as HTMLInputElement).disabled).toBe(true);
  await click('重試確認結果');expect(save.mock.calls[2][0]).toEqual(save.mock.calls[1][0]);expect(saved).toHaveBeenCalledOnce();
});
it('changing the date after a duplicate warning removes the old confirmation and requests a fresh check',async()=>{
  save.mockResolvedValueOnce({success:false,error:'請先核對',duplicateReview:duplicate});
  await render();await set('實際上課日期','2026-01-02');await click('確認調整');
  await set('實際上課日期','2026-01-03');expect(host.textContent).not.toContain('疑似重複補登');
  await click('確認調整');expect(save.mock.calls[1][0]).toMatchObject({occurredOn:'2026-01-03'});expect(save.mock.calls[1][0]).not.toHaveProperty('duplicateAcknowledgement');
});
it('cancelling a duplicate review does not submit the debit',async()=>{
  save.mockResolvedValueOnce({success:false,error:'請先核對',duplicateReview:duplicate});
  await render();await set('實際上課日期','2026-01-02');await click('確認調整');await click('取消');
  expect(save).toHaveBeenCalledOnce();expect(saved).not.toHaveBeenCalled();expect(host.querySelector('[aria-label="調整堂數"]')).toBeNull();
});
