// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('@/components/beauty/catalog-adapter',()=>({BeautyCourseCatalog:()=>null}));
import {BeautyManagementList} from '@/components/beauty/management-list';
import type {BeautyDashboardData} from '@/server/beauty/queries';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it('keeps disabled technicians collapsed, searchable and reachable without changing records',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),onEdit=vi.fn();
 const data={techs:[{id:'on',name:'啟用技師',active:true},{id:'off',name:'停用測試技師',active:false}],services:[]} as unknown as BeautyDashboardData;
 const name=(value:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===value);
 const toggle=()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('停用人員（'))!;
 try{
  await act(async()=>root.render(h(BeautyManagementList,{tab:'技師管理',data,canEdit:false,onEdit})));
  expect(name('啟用技師')).toBeTruthy();expect(name('停用測試技師')).toBeUndefined();expect(toggle().getAttribute('aria-expanded')).toBe('false');
  await act(async()=>toggle().click());expect(name('停用測試技師')).toBeTruthy();await act(async()=>name('停用測試技師')!.click());expect(onEdit).toHaveBeenCalledWith('technician',data.techs[1]);
  await act(async()=>toggle().click());expect(name('停用測試技師')).toBeUndefined();
  const search=host.querySelector<HTMLInputElement>('input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'停用測試');search.dispatchEvent(new Event('input',{bubbles:true}));});expect(name('停用測試技師')).toBeTruthy();expect((toggle() as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>name('清除篩選')!.click());expect(name('停用測試技師')).toBeUndefined();
  const status=host.querySelector<HTMLSelectElement>('select[aria-label="狀態篩選"]')!;await act(async()=>{status.value='inactive';status.dispatchEvent(new Event('change',{bubbles:true}));});expect(name('停用測試技師')).toBeTruthy();expect(name('啟用技師')).toBeUndefined();
  expect(data.techs[1].active).toBe(false);
 }finally {await act(async()=>root.unmount());host.remove();}
});
