// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {PlanManagementControls} from '@/components/admin/plan-management-controls';
import {PlanGridActions,type PlanGridAction} from '@/components/admin/plan-grid-actions';
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
let host:HTMLDivElement,root:Root;
const save=vi.fn(),adjust=vi.fn(),onSaved=vi.fn();
const card={id:'card-a',remaining:8,held:0,expiresAt:'2027-12-31T15:59:59.999Z',closed:false};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(initialAction?:PlanGridAction){await act(async()=>root.render(React.createElement(PlanManagementControls,{compactActions:true,initialAction,storeId:"store",card,save,sessionAdjustment:{save:adjust,records:[],members:[{id:"learner",name:"學員"}]},onSaved})));}
async function click(text:string){let b=[...document.querySelectorAll('button')].find(b=>b.textContent===text&&!b.closest('[hidden]'));if(!b&&text!=='⋯'){const menu=document.querySelector<HTMLButtonElement>('button[aria-label="方案 更多操作"]');expect(menu).toBeTruthy();await act(async()=>menu!.click());b=[...document.querySelectorAll('button')].find(b=>b.textContent===text&&!b.closest('[hidden]'));}expect(b).toBeTruthy();await act(async()=>b!.click());}
it.each(['BACKFILL','VOID'] as const)('opens the correct %s form without a financial write',async action=>{
 await render();expect(host.querySelector('[aria-label="調整類型"]')).toBeNull();await click(action==='VOID'?'註銷堂數':'補登已上課');
 expect(host.querySelector<HTMLSelectElement>('[aria-label="調整類型"]')?.value).toBe(action);
 expect(!!host.querySelector('[aria-label="實際上課日期"]')).toBe(action==='BACKFILL');expect(adjust).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
});
it.each(['BACKFILL','VOID'] as const)('a grid shortcut preselects %s after opening the authoritative detail',async action=>{
 await render(action);expect(host.querySelector<HTMLSelectElement>('[aria-label="調整類型"]')?.value).toBe(action);expect(adjust).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
});
it('keeps whole-plan cancellation inside More and retains explicit confirmation',async()=>{
 await render();expect(document.querySelector('button[aria-label="方案 更多操作"]')).not.toBeNull();expect([...host.querySelectorAll('button')].some(b=>b.textContent==='註銷方案')).toBe(false);
 await click('⋯');await click('註銷方案');expect(host.textContent).toContain('收回剩餘 8 堂');expect(host.textContent).toContain('不會自動退款');expect(save).not.toHaveBeenCalled();expect(adjust).not.toHaveBeenCalled();
 expect([...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='確認註銷')?.disabled).toBe(true);
});
it('cancel then choose another operation does not retain the previous type',async()=>{
 await render();await click('註銷堂數');await click('取消');await click('補登已上課');expect(host.querySelector<HTMLSelectElement>('[aria-label="調整類型"]')?.value).toBe('BACKFILL');expect(adjust).not.toHaveBeenCalled();
});
it('disabled navigation cannot select a different financial operation',async()=>{
 const select=vi.fn();await act(async()=>root.render(React.createElement(PlanGridActions,{disabled:true,onSelect:select})));await click('補登已上課');await click('⋯');await click('註銷方案');expect(select).not.toHaveBeenCalled();
});
it('consumes the shortcut once so a refreshed balance does not reopen the adjustment',async()=>{
 adjust.mockImplementation(async input=>({success:true,data:{remaining:7,expiresAt:card.expiresAt,record:{id:'adjustment',cardId:card.id,customerId:'learner',customerName:'學員',operation:input.operation,quantity:1,occurredOn:null,reason:'',recordedAt:'2026-11-11T02:00:00Z',actorName:'店長',reversalOf:null,remainingBefore:8,remainingAfter:7}}}));
 function Holder(){
  const [entry,setEntry]=React.useState<PlanGridAction|undefined>('VOID'),[revision,setRevision]=React.useState(0);
  return React.createElement(PlanManagementControls,{key:revision,compactActions:true,initialAction:entry,onInitialActionConsumed:()=>setEntry(undefined),storeId:'store',card:{...card,remaining:revision?7:8},save,sessionAdjustment:{save:adjust,records:[],members:[{id:'learner',name:'學員'}]},onSaved:()=>setRevision(n=>n+1)});
 }
 await act(async()=>root.render(React.createElement(Holder)));expect(host.querySelector<HTMLSelectElement>('[aria-label="調整類型"]')?.value).toBe('VOID');
 await click('確認調整');expect(adjust).toHaveBeenCalledOnce();expect(host.querySelector('[aria-label="調整類型"]')).toBeNull();expect(save).not.toHaveBeenCalled();
});
it('keeps point plans free of session adjustments',async()=>{
 const select=vi.fn();await act(async()=>root.render(React.createElement(PlanGridActions,{allowSession:false,onSelect:select})));await click('⋯');
 expect([...document.querySelectorAll('button')].some(b=>/補登|註銷堂數/.test(b.textContent??''))).toBe(false);
 await click('調整期限');expect(select).toHaveBeenCalledWith('expiry');
});
it('uses service units for Beauty session actions',async()=>{
 const select=vi.fn();await act(async()=>root.render(React.createElement(PlanGridActions,{unitLabel:'次',onSelect:select})));await click('⋯');await click('補登已服務');expect(select).toHaveBeenCalledWith('BACKFILL');
});
