// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/admin/settings-panel-context',()=>({useSettingsPanelGuard:vi.fn()}));
vi.mock('@/components/admin/use-course-draft-guard',()=>({useCourseDraftGuard:vi.fn()}));
import {AddOnCatalog} from '@/components/add-ons/catalog';
it('cancels activation without saving and submits the chosen state with the catalog revision',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),save=vi.fn().mockResolvedValue({success:true,data:{revision:3}});
 try{
  await act(async()=>root.render(createElement(AddOnCatalog,{module:'STEAMFOOT',storeId:'s',revision:2,enabled:false,groups:[],save})));
  const checkbox=()=>host.querySelector<HTMLInputElement>('input[name="enabled"]')!;
  expect(checkbox().checked).toBe(false);
  await act(async()=>checkbox().click());expect(checkbox().checked).toBe(true);
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='取消')!.click());
  expect(checkbox().checked).toBe(false);expect(save).not.toHaveBeenCalled();
  await act(async()=>checkbox().click());
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({storeId:'s',revision:2,enabled:true,groups:[]}));
  expect(host.textContent).toContain('已儲存');
 }finally{await act(async()=>root.unmount());host.remove();}
});
