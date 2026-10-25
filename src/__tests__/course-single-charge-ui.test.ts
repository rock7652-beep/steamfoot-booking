// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CoursePlanDraftForm} from '@/app/(dashboard)/dashboard/courses/course-profile-forms';
import {OperationScope} from '@/components/operations/operation-scope';
const m=vi.hoisted(()=>({save:vi.fn(),sports:vi.fn()}));
vi.mock('@/server/actions/course-members',()=>({saveCourseCustomer:vi.fn()}));
vi.mock('@/server/actions/sports-staging',()=>({saveSportsFee:m.sports}));
vi.mock('@/components/admin/use-settings-save',()=>({useSettingsSave:()=>({uncertain:false,save:m.save})}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/dashboard/courses',useRouter:()=>({refresh:vi.fn()})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:ReturnType<typeof createRoot>;
beforeEach(()=>{sessionStorage.clear();vi.resetAllMocks();m.save.mockResolvedValue({success:true});m.sports.mockResolvedValue({success:true});});
afterEach(()=>{act(()=>root?.unmount());document.body.replaceChildren();});
function input(label:string){return document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;}
function fill(el:HTMLInputElement,value:string){act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
function mount(music:boolean,schedulingModes?:{selfBookingEnabled:boolean;assignedSchedulingEnabled:boolean},plan:Parameters<typeof CoursePlanDraftForm>[0]["plan"]=null){const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(h(OperationScope,{scope:'test'},h(CoursePlanDraftForm,{storeId:'store',music,plan,subjects:[{id:'subject',name:'教學項目',category:'',isActive:true}],templates:[{id:'template',name:'項目',category:'',isActive:true,musicSubjectId:'subject',durationMinutes:60}],musicTeachers:[{id:'teacher',name:'合格老師',active:true,qualificationIds:['template']},{id:'unqualified',name:'無資格老師',active:true,qualificationIds:[]}],sportsData:music?undefined:{schedulingModes,storeId:'store',date:'',subjects:[{id:'subject',name:'項目',category:'',active:true,updatedAt:'',templateId:'template'}],coaches:[{id:'teacher',name:'合格教練',templates:['template']}],fees:[],lessons:[],students:[],customers:[],rooms:[]},termSessions:[],profitEnabled:false,onPending:()=>{},onSaved:()=>{}}))));}
it('music defaults to one lesson, saves free trial and duration and limits selectable teachers',async()=>{
 mount(true);
 expect(document.querySelector<HTMLSelectElement>('[aria-label="收費類型"]')!.value).toBe('single');
 expect(document.body.textContent).not.toContain('無資格老師');
 fill(input('體驗價'),'0');fill(input('體驗時間'),'20');
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.save.mock.calls[0][0]).toMatchObject({points:1,unit:'SESSION',chargeSettings:{kind:'single',trialPrice:0,trialDuration:20,providerIds:['teacher']}});
});
it('sports defaults to single; open selection clears trial overrides and retains store-based pricing',async()=>{
 mount(false);fill(input('體驗價'),'200');fill(input('體驗時間'),'30');
 const provider=[...document.querySelectorAll('fieldset')].find(f=>f.firstElementChild?.tagName==='LEGEND'&&f.firstElementChild.textContent?.includes('此收費'))!.querySelector<HTMLInputElement>('input')!;
 act(()=>provider.click());
 act(()=>{const mode=document.querySelector<HTMLSelectElement>('[aria-label="方案適用方式"]')!;mode.value='OPEN';mode.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(input('體驗價')).toBeNull();expect(document.body.textContent).toContain('沿用店家預設體驗費');
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.sports.mock.calls[0][0]).toMatchObject({sportsMode:'OPEN',amount:1,unit:'堂數',chargeSettings:{trialPrice:null,trialDuration:null,providerIds:['teacher']}});
});

it('hides disabled open-selection offers and keeps one qualified-provider picker',()=>{
 mount(false,{selfBookingEnabled:false,assignedSchedulingEnabled:true});
 expect(document.body.textContent).not.toMatch(/開放選課|通用卡/);
 expect(document.querySelector('[aria-label="方案適用方式"]')).toBeNull();
 expect([...document.querySelectorAll('legend')].filter(l=>l.textContent?.includes('此收費可安排'))).toHaveLength(1);
});
it('legacy fee editing does not duplicate or edit teaching-item qualifications',()=>{
 mount(false,{selfBookingEnabled:false,assignedSchedulingEnabled:true},{id:'legacy',name:'既有方案',points:10,price:5800,validDays:90,isActive:true,unit:'SESSION',templateIds:['template'],sportsMode:'LEGACY',sportsSubjectId:'subject'});
 expect([...document.querySelectorAll('legend')].filter(l=>l.textContent?.includes('可授課教練'))).toHaveLength(0);
 expect([...document.querySelectorAll('legend')].filter(l=>l.textContent?.includes('此收費可安排'))).toHaveLength(1);
 expect(document.body.textContent).not.toMatch(/開放選課|通用卡/);
});
