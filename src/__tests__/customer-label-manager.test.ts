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
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.load.mockResolvedValue(data);m.save.mockResolvedValue({success:true,metadata:{enabled:data.enabled,categories:data.categories,labels:data.labels}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(){await act(async()=>root.render(jsx(LabelManager,{initial:data})));const toggle=[...host.querySelectorAll("button")].find(b=>b.textContent==="管理標籤")!;expect(toggle.getAttribute("aria-expanded")).toBe("false");expect(host.querySelector("[hidden]")).toBeTruthy();await act(async()=>toggle.click());expect(toggle.getAttribute("aria-expanded")).toBe("true");}
async function click(name:string){const b=[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent===name)!;expect(b).toBeTruthy();await act(async()=>b.click());}
it('edits directly below the selected label and preserves drafts after failed saves',async()=>{await render();await click('編輯常客');const form=host.querySelector('form[aria-label="編輯常客"]')!;expect(form.parentElement?.textContent).toContain('常客編輯');expect(form.querySelector('select')?.value).toBe('cat');m.save.mockResolvedValue({success:false,error:'請重試'});await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('[role="alert"]')?.textContent).toBe('請重試');expect(host.querySelector('form[aria-label="編輯常客"]')).toBeTruthy();await click('取消');expect(host.querySelector('form[aria-label="編輯常客"]')).toBeNull();});
it('adds within a category, clears the input and keeps the form open for the next label',async()=>{await render();await click('＋標籤');const form=host.querySelector('form[aria-label="在需求新增標籤"]')!;const input=form.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'重點');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(m.save).toHaveBeenCalledWith({action:'label',categoryId:'cat',name:'重點'});expect(input.value).toBe('');expect(host.querySelector('form[aria-label="在需求新增標籤"]')).toBeTruthy();expect(host.querySelector('[role="status"]')?.textContent).toBe('已新增標籤');});
it('collects inactive labels in a collapsed bottom section and allows restoration',async()=>{await render();const details=host.querySelector('details')!;expect(details.open).toBe(false);expect(details.textContent).toContain('舊客');expect(host.querySelector('section[aria-label="需求分類"]')?.textContent).not.toContain('舊客');await click('啟用舊客');expect(m.save).toHaveBeenCalledWith({action:'active',kind:'label',id:'b',active:true});expect(host.querySelector('[role="status"]')?.textContent).toBe('已啟用');});

it('shows changes before a slow save finishes, prevents duplicates and rolls back failure',async()=>{
 await render();let resolve!:(value:unknown)=>void;m.save.mockReturnValue(new Promise(r=>{resolve=r}));
 await click('啟用舊客');
 expect(host.querySelector('section[aria-label="需求分類"]')?.textContent).toContain('舊客');
 expect(host.querySelector('[role="status"]')?.textContent).toBe('儲存中…');
 expect(host.querySelector('[aria-busy="true"]')).toBeTruthy();
 const form=host.querySelector('form')!;
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.save).toHaveBeenCalledTimes(1);
 await act(async()=>resolve({success:false,error:'網路忙碌'}));
 expect(host.querySelector('section[aria-label="需求分類"]')?.textContent).not.toContain('舊客');
 expect(host.querySelector('[role="alert"]')?.textContent).toBe('網路忙碌');
 expect(m.load).not.toHaveBeenCalled();
});
it('renders a pending new label, retains its input after failure and uses canonical data on retry',async()=>{
 await render();await click('＋標籤');let resolve!:(value:unknown)=>void;m.save.mockReturnValue(new Promise(r=>{resolve=r}));
 const form=host.querySelector('form[aria-label="在需求新增標籤"]')!;const input=form.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'重點');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(host.querySelector('button[aria-label="編輯重點"]')).toBeTruthy();expect(input.disabled).toBe(true);
 await act(async()=>resolve({success:false,error:'請重試'}));expect(input.value).toBe('重點');expect(host.querySelector('button[aria-label="編輯重點"]')).toBeNull();
 const metadata={enabled:true,categories:data.categories,labels:[...data.labels,{id:'real',categoryId:'cat',name:'重點',active:true}]};
 m.save.mockResolvedValue({success:true,metadata});const event=vi.fn();window.addEventListener('customer-labels:refresh',event);
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(input.value).toBe('');expect(host.querySelector('button[aria-label="編輯重點"]')).toBeTruthy();expect(event.mock.calls[0][0].detail.labels.at(-1).id).toBe('real');expect(m.load).not.toHaveBeenCalled();
 window.removeEventListener('customer-labels:refresh',event);
});

it('reorders labels with keyboard handles, previews immediately and restores failed saves',async()=>{
 const initial={...data,labels:[{...data.labels[0],position:0},{...data.labels[1],active:true,position:1}]};
 await act(async()=>root.render(jsx(LabelManager,{initial})));await click('管理標籤');
 let resolve!:(value:unknown)=>void;m.save.mockReturnValue(new Promise(r=>resolve=r));
 const handle=host.querySelector('button[aria-label="拖拉排序舊客"]')!;
 await act(async()=>handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
 expect(m.save).toHaveBeenCalledWith({action:'label-order',categoryId:'cat',ids:['b','a']});
 expect([...host.querySelectorAll('[data-sort-kind="label"]')].map(e=>(e as HTMLElement).dataset.sortId)).toEqual(['b','a']);
 await act(async()=>resolve({success:false,error:'儲存失敗'}));
 expect([...host.querySelectorAll('[data-sort-kind="label"]')].map(e=>(e as HTMLElement).dataset.sortId)).toEqual(['a','b']);
});
it('supports touch pointer dragging and cancels without writing',async()=>{
 const initial={...data,labels:[{...data.labels[0],position:0},{...data.labels[1],active:true,position:1}]};
 await act(async()=>root.render(jsx(LabelManager,{initial})));await click('管理標籤');
 const handle=host.querySelector('button[aria-label="拖拉排序常客"]')!;
 Object.assign(handle,{setPointerCapture:vi.fn()});
 const target=host.querySelector('[data-sort-id="b"]')!;Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>target});
 const pointer=(name:string)=>{const e=new Event(name,{bubbles:true});Object.assign(e,{button:0,pointerId:1,clientX:1,clientY:1,pointerType:'touch'});handle.dispatchEvent(e);};
 await act(async()=>{pointer('pointerdown');pointer('pointermove');pointer('pointercancel');});expect(m.save).not.toHaveBeenCalled();
 await act(async()=>{pointer('pointerdown');pointer('pointermove');pointer('pointerup');});
 expect(m.save).toHaveBeenCalledWith({action:'label-order',categoryId:'cat',ids:['b','a']});
});
