// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({usePathname:()=>'/hq/dashboard/beauty',useRouter:()=>({refresh:vi.fn()})}));
import {CoursePersonnelLabelProvider,useBeautyPersonnelText} from '@/components/course-personnel-label';
import {CourseSettingsSectionEditor} from '@/app/(dashboard)/dashboard/courses/settings-section-editor';
import {courseSettingsSectionRevision} from '@/lib/course-settings-sections';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
function Sample(){const t=useBeautyPersonnelText();return h('div',null,h('h2',null,t('技師管理')),h('span',null,'陳技師'),h('p',null,'王技師介紹'),h('a',{href:'/dashboard/beauty?tab=技師管理'},t('技師管理')));}
it('scopes successful label events to the store and preserves names, notes and route keys',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const render=(storeId:string,label:null|'老師'=null)=>h(CoursePersonnelLabelProvider,{storeId,label},h(Sample));
 const saved=(storeId:string,label:null|'老師')=>window.dispatchEvent(new CustomEvent('course-personnel-label-saved',{detail:{storeId,label}}));
 try{await act(async()=>root.render(render('a')));expect(host.querySelector('h2')?.textContent).toBe('技師管理');await act(async()=>saved('b','老師'));expect(host.querySelector('h2')?.textContent).toBe('技師管理');await act(async()=>saved('a','老師'));expect(host.querySelector('h2')?.textContent).toBe('老師管理');expect(host.querySelector('span')?.textContent).toBe('陳技師');expect(host.querySelector('p')?.textContent).toBe('王技師介紹');expect(host.querySelector('a')?.getAttribute('href')).toContain('tab=技師管理');await act(async()=>root.render(render('b')));expect(host.querySelector('h2')?.textContent).toBe('技師管理');await act(async()=>root.render(render('a','老師')));await act(async()=>saved('a',null));expect(host.querySelector('h2')?.textContent).toBe('技師管理');}finally{await act(async()=>root.unmount());host.remove();}
});
it('offers only Beauty choices, keeps failed drafts and publishes only confirmed saves',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),onSaved=vi.fn(),event=vi.fn();window.addEventListener('course-personnel-label-saved',event);
 let fail=true;const fetch=vi.fn(async(_url:string,init:RequestInit)=>{const input=JSON.parse(String(init.body));return {json:async()=>fail?{success:false,error:'暫時無法儲存'}:{success:true,storeId:'a',data:{values:input.values,revision:courseSettingsSectionRevision(input.values)}}};});vi.stubGlobal('fetch',fetch);
 try{await act(async()=>root.render(h(CoursePersonnelLabelProvider,{storeId:'a',label:null},h(CourseSettingsSectionEditor,{storeId:'a',personnelKind:'beauty',savePath:'/api/beauty/settings/store',initial:{section:'personnel',personnelLabel:null},onStatus:vi.fn(),onSaved}),h(Sample))));const select=host.querySelector('select')!;expect([...select.options].map(o=>o.textContent)).toEqual(['技師（預設）','老師']);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(select,'老師');select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(select.value).toBe('老師');expect(host.textContent).toContain('暫時無法儲存');expect(host.querySelector('h2')?.textContent).toBe('技師管理');expect(event).not.toHaveBeenCalled();fail=false;await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('h2')?.textContent).toBe('老師管理');expect(onSaved).toHaveBeenCalledOnce();expect(event).toHaveBeenCalledOnce();expect(JSON.parse(String(fetch.mock.calls[1][1].body))).toMatchObject({expectedStoreId:'a',values:{section:'personnel',personnelLabel:'老師'}});expect(fetch.mock.calls[1][0]).toBe('/api/beauty/settings/store');}finally{await act(async()=>root.unmount());host.remove();window.removeEventListener('course-personnel-label-saved',event);vi.unstubAllGlobals();}
});
