// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {AddOnFields} from '@/components/add-ons/fields';
it.each(['BEAUTY','STEAMFOOT','FITNESS','MUSIC'] as const)('%s exposes removal directly in the editor and confirms before changing the draft',async addOnModule=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),dirty=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 const groups=[{id:'g',title:'飲品加購',required:false,multiple:true,options:[{id:'tea',name:'茶',price:80,duration:0,active:true},{id:'water',name:'水',price:0,duration:0,active:true}]}];
 const state=()=>JSON.parse(host.querySelector<HTMLInputElement>('input[name="addOnGroups"]')!.value);
 try{
  await act(async()=>root.render(createElement(AddOnFields,{module:addOnModule,storeId:'s',initial:groups,onDirty:dirty})));
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='修改茶')!.click());
  const remove=[...host.querySelectorAll('button')].find(b=>(addOnModule==='BEAUTY'?b.getAttribute('aria-label')==='移除茶':b.textContent==='移除項目')&&!b.closest('[hidden]'))!;
  expect(remove).toBeTruthy();expect(remove.closest('details')).toBeNull();
  await act(async()=>remove.click());expect(state()[0].options).toHaveLength(2);expect(dirty).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);await act(async()=>remove.click());
  expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('既有預約與款項紀錄會保留'));
  expect(state()[0].options.map((o:{id:string})=>o.id)).toEqual(['water']);expect(dirty).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());host.remove();confirm.mockRestore();}
});
