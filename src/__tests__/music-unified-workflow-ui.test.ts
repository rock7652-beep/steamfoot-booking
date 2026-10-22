// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {OperationScope} from "@/components/operations/operation-scope";
const m=vi.hoisted(()=>({subject:vi.fn(),fee:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh,push:vi.fn()}),usePathname:()=>"/dashboard/courses",useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/server/actions/music-subject",()=>({saveMusicSubject:m.subject}));
vi.mock("@/server/actions/course-members",()=>({saveCoursePointPlan:m.fee,saveCourseCustomer:vi.fn()}));
vi.mock("@/server/actions/course-batch",()=>({courseStatusImpact:vi.fn()}));
vi.mock("@/components/admin/course-display-order",()=>({useCourseDisplayOrder:()=>({compare:()=>0,rowProps:()=>({}),handle:()=>null})}));
vi.mock("@/components/admin/course-status-button",()=>({useCourseStatusRows:(rows:unknown[])=>[rows,vi.fn(),[],vi.fn()]}));
vi.mock("@/components/admin/course-batch-selection",()=>({CourseBatchBar:()=>null}));
import {MusicSubjectCatalog} from "@/app/(dashboard)/dashboard/courses/music-subject-catalog";
import {CoursePlanDraftForm} from "@/app/(dashboard)/dashboard/courses/course-profile-forms";
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});sessionStorage.clear();vi.clearAllMocks();m.subject.mockResolvedValue({success:true});m.fee.mockResolvedValue({success:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click=async(text:string)=>{const b=Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent===text);expect(b).toBeTruthy();await act(async()=>b!.click());};
const input=async(el:HTMLInputElement,value:string)=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});};
it('item editing exposes only the agreed item fields and accepts a 45-minute default',async()=>{
 await act(async()=>root.render(React.createElement(MusicSubjectCatalog,{subjects:[],canCreate:true,canEdit:true})));
 await click('＋新增教學項目');
 const form=document.body.querySelector('form')!;
 expect([...form.querySelectorAll('[name]')].map(e=>e.getAttribute('name'))).toEqual(['name','durationMinutes','visibility','description','precautions']);
 await input(form.querySelector('[name="name"]')!,'鋼琴');await input(form.querySelector('[name="durationMinutes"]')!,'45');
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.subject).toHaveBeenCalledWith(expect.objectContaining({name:'鋼琴',durationMinutes:45,visibility:'PUBLIC'}));
 expect(m.subject.mock.calls[0][0]).not.toHaveProperty('capacity');expect(m.subject.mock.calls[0][0]).not.toHaveProperty('classType');
});
it('fee teacher selection carries both the new selection and the original qualification version',async()=>{
 await act(async()=>root.render(React.createElement(OperationScope,{scope:'music-owner'},React.createElement(CoursePlanDraftForm,{music:true,plan:null,initialTemplateId:'A',subjects:[{id:'A',name:'鋼琴',category:'',isActive:true}],templates:[{id:'a1',musicSubjectId:'A',name:'鋼琴',category:'',isActive:true}],musicTeachers:[{id:'t1',name:'老師一',active:true,qualificationIds:['a1']},{id:'t2',name:'老師二',active:true,qualificationIds:[]}],canEditMusicTeachers:true,termSessions:[],profitEnabled:false,onPending:()=>{},onSaved:()=>{}}))));
 const teacher=Array.from(host.querySelectorAll('label')).find(l=>l.textContent==='老師二')!.querySelector('input')!;
 await act(async()=>teacher.click());
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.fee).toHaveBeenCalledWith(expect.objectContaining({musicTeacherIds:['t1','t2'],expectedMusicTeacherIds:['t1'],musicTerms:1,musicSetup:expect.objectContaining({subjectId:'A'})}));
});
