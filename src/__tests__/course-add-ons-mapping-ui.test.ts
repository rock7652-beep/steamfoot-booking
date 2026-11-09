// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {AddOnFields} from '@/components/add-ons/fields';
it('previews the chosen teaching item, clears selections on switching, and edits A applicability in the draft',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),dirty=vi.fn();
 const groups=[{id:'ga',title:'教材',subjectIds:['A'],required:false,multiple:true,options:[{id:'book',name:'教材本',price:80,duration:0,active:true}]},{id:'gb',title:'飲品',subjectIds:['B'],required:false,multiple:true,options:[{id:'tea',name:'養生茶',price:50,duration:0,active:true}]}];
 try{
 await act(async()=>root.render(createElement(AddOnFields,{module:'MUSIC',storeId:'s',initial:groups,subjects:[{id:'A',name:'鋼琴',isActive:true},{id:'B',name:'小提琴',isActive:true}],onDirty:dirty})));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='顧客畫面預覽')!.click());
 const dialog=document.querySelector('aside[role="dialog"]')!,select=dialog.querySelector('select')!;
 await act(async()=>{select.value='A';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(dialog.textContent).toContain('教材本');expect(dialog.textContent).not.toContain('養生茶');
 await act(async()=>dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
 expect(dialog.querySelector('strong')!.textContent).toBe('$80');
 await act(async()=>{select.value='B';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(dialog.textContent).not.toContain('教材本');expect(dialog.textContent).toContain('養生茶');expect(dialog.querySelector('strong')!.textContent).toBe('$0');
 expect(dirty).not.toHaveBeenCalled();
 await act(async()=>dialog.querySelector<HTMLButtonElement>('[aria-label="關閉附加項目預覽"]')!.click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='群組設定')!.click());
 const editor=[...host.querySelectorAll('fieldset')].find(f=>f.querySelector('legend')?.textContent==='適用教學項目')!;
 await act(async()=>[...editor.querySelectorAll('label')].find(l=>l.textContent==='小提琴')!.querySelector('input')!.click());
 const draft=JSON.parse(host.querySelector<HTMLInputElement>('input[name="addOnGroups"]')!.value);
 expect(draft[0].subjectIds).toEqual(['A','B']);expect(dirty).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());host.remove();}
});
