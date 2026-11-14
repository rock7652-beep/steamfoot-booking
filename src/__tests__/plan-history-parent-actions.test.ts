// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {PlanManagementControls} from '@/components/admin/plan-management-controls';
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
it('hides the unrelated shared-member save while reversing a usage record',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const save=vi.fn(),adjust=vi.fn();
 function Holder(){const [editing,setEditing]=React.useState(false);return React.createElement(React.Fragment,null,
 React.createElement(PlanManagementControls,{compactActions:true,initialAction:'history',storeId:'store',card:{id:'card',remaining:9,held:0,expiresAt:null,closed:false},save,sessionAdjustment:{save:adjust,records:[{id:'original',cardId:'card',customerId:'learner',customerName:'學員',operation:'VOID',quantity:1,occurredOn:null,reason:'原始註銷',recordedAt:'2026-11-11T02:00:00Z',actorName:'店長',reversalOf:null}],members:[{id:'learner',name:'學員'}]},onSaved:()=>{},onEditingChange:setEditing}),
 !editing&&React.createElement('button',null,'儲存共卡成員'));}
 try{await act(async()=>root.render(React.createElement(Holder)));const reverse=[...host.querySelectorAll('button')].find(b=>b.textContent==='更正返還');expect(reverse).toBeTruthy();await act(async()=>reverse!.click());expect(host.querySelector('[aria-label="調整原因（選填）"]')).not.toBeNull();expect(save).not.toHaveBeenCalled();expect(adjust).not.toHaveBeenCalled();expect([...host.querySelectorAll('button')].some(b=>b.textContent==='儲存共卡成員')).toBe(false);
 const collapse=[...host.querySelectorAll('button')].find(b=>b.textContent==='收合');expect(collapse).toBeTruthy();await act(async()=>collapse!.click());expect([...host.querySelectorAll('button')].some(b=>b.textContent==='儲存共卡成員')).toBe(true);expect(host.querySelector('[aria-label="調整原因（選填）"]')).toBeNull();expect(save).not.toHaveBeenCalled();expect(adjust).not.toHaveBeenCalled();}
 finally{await act(async()=>root.unmount());host.remove();}
});
