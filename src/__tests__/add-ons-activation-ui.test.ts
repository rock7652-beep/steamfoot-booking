// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/admin/settings-panel-context',()=>({useSettingsPanelGuard:vi.fn()}));
vi.mock('@/components/admin/use-course-draft-guard',()=>({useCourseDraftGuard:vi.fn()}));
import {AddOnCatalog} from '@/components/add-ons/catalog';
it('edits individual products without a shop activation switch and preserves draft cancellation',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),save=vi.fn().mockResolvedValue({success:true,data:{revision:3}});
 try{
  await act(async()=>root.render(createElement(AddOnCatalog,{module:'STEAMFOOT',storeId:'s',revision:2,enabled:false,groups:[],save})));
  expect(host.querySelector('input[name="enabled"]')).toBeNull();
  const add=()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('新增附加項目'))!;
  await act(async()=>add().click());
  await act(async()=>[...host.querySelectorAll('button')].filter(b=>b.textContent==='取消').at(-1)!.click());
  expect(save).not.toHaveBeenCalled();
  await act(async()=>add().click());
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({storeId:'s',revision:2,groups:expect.any(Array)}));
  expect(save.mock.calls[0][0]).not.toHaveProperty('enabled');
  expect(host.textContent).toContain('已儲存');
 }finally{await act(async()=>root.unmount());host.remove();}
});
