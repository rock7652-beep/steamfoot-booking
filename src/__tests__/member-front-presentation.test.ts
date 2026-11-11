// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/components/admin/modal-panel',()=>({ModalPanel:()=>null}));
import {StoreImageAnnouncements} from '@/components/image-announcements/carousel';
import {CustomerBookingRow} from '@/components/customer-booking-row';
import type {ImageAnnouncement} from '@/lib/image-announcements';
let root:Root,host:HTMLDivElement;
const first:ImageAnnouncement={id:'00000000-0000-4000-8000-000000000001',enabled:true,startsOn:'',endsOn:''};
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:false}));host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('renders server-provided images on first render without a second list request',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await act(async()=>root.render(h(StoreImageAnnouncements,{storeSlug:'a',initialItems:[first,{...first,id:'00000000-0000-4000-8000-000000000002'}]})));
 const images=host.querySelectorAll('img');expect(images).toHaveLength(2);expect(images[0].getAttribute('fetchpriority')).toBe('high');expect(images[1].getAttribute('fetchpriority')).toBe('low');expect(fetch).not.toHaveBeenCalled();
});
it('does not replace a new store initial image with an old in-flight list',async()=>{
 let finish!:(v:unknown)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>{finish=r;})));
 await act(async()=>root.render(h(StoreImageAnnouncements,{storeSlug:'old',preview:true})));
 await act(async()=>root.render(h(StoreImageAnnouncements,{storeSlug:'new',initialItems:[first]})));
 await act(async()=>finish({ok:true,json:async()=>({items:[{...first,id:'00000000-0000-4000-8000-000000000002'}]})}));
 expect(host.querySelector('img')?.getAttribute('src')).toContain('store=new');expect(host.textContent).not.toContain('old');expect(host.querySelector('img')?.getAttribute('src')).not.toContain('preview=1');
});
it('does not reserve an empty announcement region when the server confirms none',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await act(async()=>root.render(h(StoreImageAnnouncements,{storeSlug:'a',initialItems:[]})));
 expect(host.querySelector('[data-image-announcements]')).toBeNull();expect(fetch).not.toHaveBeenCalled();
});
it('removes empty or duplicate-only disclosure controls instead of opening a blank region',async()=>{
 await act(async()=>root.render(h(CustomerBookingRow,{when:'11/11 10:00',status:'已完成',description:'按摩 · 技師甲',expandable:false},h('p',null,'按摩 · 技師甲 · 已完成'))));
 expect(host.querySelector('[data-customer-booking-row]')?.tagName).toBe('ARTICLE');expect(host.querySelector('summary')).toBeNull();expect(host.textContent?.match(/已完成/g)).toHaveLength(1);expect(host.textContent?.match(/按摩/g)).toHaveLength(1);
});
it('keeps unique booking actions accessible through an in-place disclosure',async()=>{
 const save=vi.fn();await act(async()=>root.render(h(CustomerBookingRow,{when:'11/11 10:00',status:'已預約',description:'按摩 · 技師甲',expandable:true},h('button',{onClick:save},'取消預約'))));
 const details=host.querySelector('details')!;await act(async()=>details.querySelector('summary')!.click());expect(details.open).toBe(true);await act(async()=>host.querySelector('button')!.click());expect(save).toHaveBeenCalledTimes(1);
});
