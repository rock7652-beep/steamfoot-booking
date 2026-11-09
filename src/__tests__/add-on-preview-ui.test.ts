// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {AddOnFields} from '@/components/add-ons/fields';
it('previews groups independently, calculates add-on subtotal and does not dirty or submit the catalog',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),dirty=vi.fn(),change=vi.fn(),submit=vi.fn();
 const groups=[{id:'drinks',title:'飲品加購',required:false,multiple:true,options:[{id:'tea',name:'茶',price:80,duration:0,active:true},{id:'old',name:'停用品項',price:10,duration:0,active:false}]},{id:'snacks',title:'點心加購',required:false,multiple:false,options:[{id:'snack',name:'點心',price:50,duration:0,active:true}]}];
 try{
  await act(async()=>root.render(createElement('form',{onChange:change,onSubmit:submit},createElement(AddOnFields,{module:'STEAMFOOT',storeId:'s',initial:groups,onDirty:dirty}))));
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='顧客畫面預覽')!.click());
  const dialog=document.querySelector('aside[role="dialog"]')!;
  expect(dialog.textContent).toContain('飲品加購');expect(dialog.textContent).toContain('點心加購');expect(dialog.textContent).not.toContain('停用品項');
  await act(async()=>dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async()=>[...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')].at(-1)!.click());
  expect(dialog.querySelector('strong')!.textContent).toBe('$130');expect(change).not.toHaveBeenCalled();expect(dirty).not.toHaveBeenCalled();expect(submit).not.toHaveBeenCalled();
  await act(async()=>dialog.querySelector<HTMLButtonElement>('[aria-label="關閉附加項目預覽"]')!.click());expect(document.querySelector('aside[role="dialog"]')).toBeNull();
  expect(JSON.parse(host.querySelector<HTMLInputElement>('input[name="addOnGroups"]')!.value)).toHaveLength(2);
 }finally{await act(async()=>root.unmount());host.remove();}
});
