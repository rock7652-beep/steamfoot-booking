// @vitest-environment jsdom
import {act,useState,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {CoursePortalCalendar} from '@/components/course-portal-calendar';
import {CoursePortalNavigation} from '@/components/course-portal-navigation';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const roots:{root:ReturnType<typeof createRoot>;host:HTMLDivElement}[]=[];
function mount(node:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});act(()=>root.render(node));return host;}
afterEach(()=>{for(const {root,host}of roots.splice(0)){act(()=>root.unmount());host.remove();}});
it('keeps the existing course unit by default and reports the selected date',()=>{
 const choose=vi.fn();const host=mount(h(CoursePortalCalendar,{month:'2026-10',selected:'2026-10-21',days:[{date:'2026-10-21',count:2,closed:false,self:true}],monthPicker:null,context:'班表',legend:'本人',onSelect:choose}));
 const button=host.querySelector('button')!;expect(button.getAttribute('aria-label')).toBe('2026-10-21 2堂');expect(button.getAttribute('aria-pressed')).toBe('true');act(()=>button.click());expect(choose).toHaveBeenCalledWith('2026-10-21');expect(host.querySelector('[aria-label="本人預約"]')).not.toBeNull();
});
it('uses the same calendar for Beauty counts without course units or fake closure marks',()=>{
 const host=mount(h(CoursePortalCalendar,{month:'2026-10',selected:'2026-10-21',days:[{date:'2026-10-21',count:3,closed:false}],unit:'次',markers:false,monthPicker:null,context:'我的班表',legend:'服務次數',onSelect:()=>{}}));
 expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('2026-10-21 3次');expect(host.querySelector('.closed')).toBeNull();expect(host.querySelector('.cp-dots')).toBeNull();
});
it('changes portal navigation through the shared accessible controls',()=>{
 function Harness(){const [view,setView]=useState('home');return h(CoursePortalNavigation,{items:[{id:'home',label:'首頁',icon:'home'},{id:'schedule',label:'我的班表',icon:'calendar'}],current:view,onSelect:setView});}
 const host=mount(h(Harness));const buttons=host.querySelectorAll('button');expect(buttons[0].getAttribute('aria-current')).toBe('page');act(()=>buttons[1].click());expect(buttons[1].getAttribute('aria-current')).toBe('page');expect(buttons[0].hasAttribute('aria-current')).toBe(false);
});
