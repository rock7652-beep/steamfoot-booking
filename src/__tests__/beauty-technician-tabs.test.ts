// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('@/server/actions/beauty',()=>({saveBeautyCatalog:m.save,saveBeautyLocation:vi.fn(),saveBeautySettings:vi.fn()}));
import {BeautyCatalogEditor} from '@/components/beauty/catalog-editor';
import type {BeautyDashboardData} from '@/server/beauty/queries';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const roots:{root:ReturnType<typeof createRoot>;host:HTMLDivElement}[]=[];
const data={services:[{id:'face',name:'做臉'}],customers:[{id:'customer',userId:'member',name:'技師會員'}]} as unknown as BeautyDashboardData;
function mount(gender='FEMALE') {const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});m.save.mockResolvedValue({success:true});const saved=vi.fn();act(()=>root.render(h(BeautyCatalogEditor,{kind:'technician',data,draft:{id:'tech',name:'技師',gender,revision:1,sort:0,active:true,userId:'member',serviceIds:['face'],weekly:[{day:1,start:'09:00',end:'18:00'}],exceptions:{},rates:{face:{mode:'PERCENT',value:50,base:'PAID'}},grants:['income','cancel']},onClose:vi.fn(),onSaved:saved})));return {host,saved};}
function tab(host:HTMLElement,label:string){return [...host.querySelectorAll('nav button')].find(b=>b.textContent===label) as HTMLButtonElement;}
afterEach(()=>{for(const {root,host} of roots.splice(0)){act(()=>root.unmount());host.remove();}vi.clearAllMocks();});
it('keeps fields from every category in the submitted technician payload',async()=>{const {host,saved}=mount();act(()=>tab(host,'服務與拆帳').click());act(()=>tab(host,'可服務時間').click());act(()=>tab(host,'會員與工作權限').click());await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(saved).toHaveBeenCalledOnce();expect(m.save.mock.calls[0][0]).toBe('technician');expect(m.save.mock.calls[0][1]).toMatchObject({gender:'FEMALE',userId:'member',grants:['cancel','income'],weekly:[{day:1,start:'09:00',end:'18:00'}],rates:{face:{mode:'PERCENT',value:50,base:'PAID'}},serviceIds:['face']});});
it('returns to the category containing a missing required gender',()=>{const {host}=mount('');act(()=>tab(host,'服務與拆帳').click());act(()=>{expect(host.querySelector('form')!.checkValidity()).toBe(false);});expect(tab(host,'基本資料').getAttribute('aria-pressed')).toBe('true');expect(m.save).not.toHaveBeenCalled();});
