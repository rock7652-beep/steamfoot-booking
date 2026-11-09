// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {BeautyMoveDialog} from '@/components/beauty/move-dialog';
let host:HTMLDivElement,root:Root;const submit=vi.fn(),close=vi.fn();
const props={startsAt:'2026-11-03T04:30:00Z',date:'2026-11-03',technicians:[{id:'tech',name:'技師'}],locations:[{id:'bed',name:'床位1'}],pending:false,onClose:close,onSubmit:submit};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('opens a content-sized 640px dialog with the actual appointment time and preserves the move payload',async()=>{
 await act(async()=>root.render(createElement(BeautyMoveDialog,props)));const dialog=host.querySelector<HTMLElement>('[role="dialog"]')!;expect(dialog.dataset.fitContent).toBe('true');expect(dialog.style.getPropertyValue('--sheet-width')).toBe('640px');
 expect(host.querySelector<HTMLInputElement>('[name="date"]')!.value).toBe('2026-11-03');expect(host.querySelector<HTMLInputElement>('[name="time"]')!.value).toBe('12:30');
 host.querySelector<HTMLInputElement>('[name="note"]')!.value='顧客改期';await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(submit).toHaveBeenCalledWith({date:'2026-11-03',time:'12:30',technicianId:null,locationId:null,reason:'顧客改期'});
});
it('retains the draft after an error and blocks submit and closing controls while pending',async()=>{
 await act(async()=>root.render(createElement(BeautyMoveDialog,props)));host.querySelector<HTMLInputElement>('[name="note"]')!.value='保留原因';await act(async()=>root.render(createElement(BeautyMoveDialog,{...props,error:'時段衝突'})));expect(host.querySelector<HTMLInputElement>('[name="note"]')!.value).toBe('保留原因');
 await act(async()=>root.render(createElement(BeautyMoveDialog,{...props,pending:true})));await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(submit).not.toHaveBeenCalled();expect([...host.querySelectorAll<HTMLButtonElement>('button')].every(b=>b.disabled)).toBe(true);
});
