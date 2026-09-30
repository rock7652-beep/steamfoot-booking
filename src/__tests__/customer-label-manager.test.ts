// @vitest-environment jsdom
import {act} from 'react';
import {jsx} from 'react/jsx-runtime';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {LabelSnapshot} from '@/lib/customer-labels';
const m=vi.hoisted(()=>({load:vi.fn(),save:vi.fn()}));
vi.mock('@/server/actions/customer-labels',()=>({loadCustomerLabels:m.load,manageCustomerLabels:m.save}));
import {LabelManager} from '@/app/(dashboard)/dashboard/settings/customer-labels/label-manager';
const data:LabelSnapshot={available:true,enabled:true,canManage:true,canEdit:true,categories:[{id:'cat',name:'需求',number:1,position:0,active:true}],labels:[{id:'a',name:'常客',categoryId:'cat',active:true},{id:'b',name:'舊客',categoryId:'cat',active:false}],assignments:{}};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.load.mockResolvedValue(data);m.save.mockResolvedValue({success:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(){await act(async()=>root.render(jsx(LabelManager,{initial:data})));}
async function click(name:string){const b=[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent===name)!;expect(b).toBeTruthy();await act(async()=>b.click());}
it('edits directly below the selected label and preserves drafts after failed saves',async()=>{await render();await click('編輯常客');const form=host.querySelector('form[aria-label="編輯常客"]')!;expect(form.parentElement?.textContent).toContain('常客編輯');expect(form.querySelector('select')?.value).toBe('cat');m.save.mockResolvedValue({success:false,error:'請重試'});await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('[role="alert"]')?.textContent).toBe('請重試');expect(host.querySelector('form[aria-label="編輯常客"]')).toBeTruthy();await click('取消');expect(host.querySelector('form[aria-label="編輯常客"]')).toBeNull();});
it('adds within a category, clears the input and keeps the form open for the next label',async()=>{await render();await click('＋標籤');const form=host.querySelector('form[aria-label="在需求新增標籤"]')!;const input=form.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'重點');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(m.save).toHaveBeenCalledWith({action:'label',categoryId:'cat',name:'重點'});expect(input.value).toBe('');expect(host.querySelector('form[aria-label="在需求新增標籤"]')).toBeTruthy();expect(host.querySelector('[role="status"]')?.textContent).toBe('已新增標籤');});
it('collects inactive labels in a collapsed bottom section and allows restoration',async()=>{await render();const details=host.querySelector('details')!;expect(details.open).toBe(false);expect(details.textContent).toContain('舊客');expect(host.querySelector('section[aria-label="需求分類"]')?.textContent).not.toContain('舊客');await click('啟用舊客');expect(m.save).toHaveBeenCalledWith({action:'active',kind:'label',id:'b',active:true});expect(host.querySelector('[role="status"]')?.textContent).toBe('已啟用');});
