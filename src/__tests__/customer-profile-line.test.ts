// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {customerProfileLineLabel,CustomerProfileConnection} from '@/components/admin/customer-profile-layout';

it.each([
 ['LINKED','已核對顧客','recipient','已連結（已核對顧客）'],
 ['LINKED',null,'recipient','已連結'],
 ['LINKED','舊名稱',null,'待核對'],
 ['UNLINKED','保留的舊名稱',null,'未連結'],
 ['UNLINKED','保留的舊名稱','retained-recipient','待核對'],
 ['BLOCKED','保留的舊名稱','recipient','已封鎖'],
 [undefined,'只有名稱',null,'待核對'],
 ['UNKNOWN',null,null,'待核對'],
])('uses the same notification evidence in the list and profile (%s)',(status,name,lineUserId,label)=>{
 expect(customerProfileLineLabel(status,name,lineUserId)).toBe(label);
});

it('opens the existing management destination without mounting duplicate editors',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div'),root=createRoot(host),manage=vi.fn(),child=vi.fn(()=>createElement('p',null,'editor'));
 try{
  await act(async()=>root.render(createElement(CustomerProfileConnection,{label:'未連結',onManage:manage},createElement(child))));
  expect(host.textContent).toBe('LINE 通知：未連結 · 管理');expect(child).not.toHaveBeenCalled();
  await act(async()=>host.querySelector('button')!.click());expect(manage).toHaveBeenCalledOnce();expect(host.querySelector('details')).toBeNull();
 }finally{await act(async()=>root.unmount());}
});

it('retains the inline disclosure used by the other three modules',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CustomerProfileConnection,{label:'已連結'},createElement('p',null,'通知：未開啟'))));
  expect(host.textContent).not.toContain('通知：未開啟');
  await act(async()=>{const details=host.querySelector('details')!;details.open=true;details.dispatchEvent(new Event('toggle'));});
  expect(host.textContent).toContain('通知：未開啟');
 }finally{await act(async()=>root.unmount());}
});
