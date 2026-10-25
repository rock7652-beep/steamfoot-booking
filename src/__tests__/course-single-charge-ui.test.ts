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
function mount(music:boolean,schedulingModes?:{selfBookingEnabled:boolean;assignedSchedulingEnabled:boolean},plan:Parameters<typeof CoursePlanDraftForm>[0]["plan"]=null,profitEnabled=false){const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(h(OperationScope,{scope:'test'},h(CoursePlanDraftForm,{storeId:'store',music,plan,subjects:[{id:'subject',name:'教學項目',category:'',isActive:true}],templates:[{id:'template',name:'項目',category:'',isActive:true,musicSubjectId:'subject',durationMinutes:60}],musicTeachers:[{id:'teacher',name:'合格老師',active:true,qualificationIds:['template']},{id:'unqualified',name:'無資格老師',active:true,qualificationIds:[]}],sportsData:music?undefined:{schedulingModes,storeId:'store',date:'',subjects:[{id:'subject',name:'項目',category:'',active:true,updatedAt:'',templateId:'template'}],coaches:[{id:'teacher',name:'合格教練',templates:['template']}],fees:[],lessons:[],students:[],customers:[],rooms:[]},termSessions:[],profitEnabled,onPending:()=>{},onSaved:()=>{}}))));}
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

it('keeps store cost outside disclosure and retains it when switching fee sections',()=>{
 mount(false,{selfBookingEnabled:false,assignedSchedulingEnabled:true},null,true);
 const cost=document.querySelector<HTMLInputElement>('input[name="storeCost"]')!;
 expect(cost.closest('details')).toBeNull();fill(cost,'350');
 for(const label of ['授課設定','收費設定']){act(()=>[...document.querySelectorAll('nav button')].find(b=>b.textContent===label)!.dispatchEvent(new MouseEvent('click',{bubbles:true})));}
 expect(document.querySelector<HTMLInputElement>('input[name="storeCost"]')!.value).toBe('350');
 expect(document.body.textContent).toContain('預估利潤');
});
it('reveals the teaching section when an invalid required field is in that section',()=>{
 mount(false,{selfBookingEnabled:false,assignedSchedulingEnabled:true});
 act(()=>document.querySelector<HTMLSelectElement>('select[aria-label="教學項目"]')!.dispatchEvent(new Event('invalid',{bubbles:false,cancelable:true})));
 expect([...document.querySelectorAll('nav button')].find(b=>b.textContent==='授課設定')!.getAttribute('aria-pressed')).toBe('true');
});

it('saves independent normal and trial costs through the sports fee action',async()=>{
 mount(false,{selfBookingEnabled:false,assignedSchedulingEnabled:true},null,true);
 fill(document.querySelector<HTMLInputElement>('input[name="price"]')!,'600');
 fill(document.querySelector<HTMLInputElement>('input[name="storeCost"]')!,'350');
 fill(input('體驗價'),'300');fill(input('體驗店家成本'),'120');fill(input('體驗時間'),'30');
 const provider=[...document.querySelectorAll('fieldset')].find(f=>f.firstElementChild?.tagName==='LEGEND'&&f.firstElementChild.textContent?.includes('此收費'))!.querySelector<HTMLInputElement>('input')!;act(()=>provider.click());
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.sports.mock.calls[0][0]).toMatchObject({price:600,storeCost:350,chargeSettings:{trialPrice:300,trialStoreCost:120,trialDuration:30}});
});
it('reopens saved trial cost and shows free-trial loss without treating zero as unset',()=>{
 mount(false,{selfBookingEnabled:false,assignedSchedulingEnabled:true},{id:'fee',name:'舞蹈單堂',points:1,price:600,storeCost:350,validDays:90,isActive:true,unit:'SESSION',templateIds:['template'],sportsMode:'ASSIGNED',sportsSubjectId:'subject',chargeSettings:{kind:'single',durationMinutes:60,trialPrice:0,trialDuration:30,trialStoreCost:120,providerIds:['teacher']}},true);
 expect(input('體驗店家成本').value).toBe('120');
 expect(document.querySelector('[data-fee-section="trial"]')!.textContent).toContain('NT$ -120');
 fill(input('體驗店家成本'),'0');expect(document.querySelector('[data-fee-section="trial"]')!.textContent).toContain('NT$ 0');
});

it('keeps a visible pricing section when a trial fee is switched to a multi-lesson plan',()=>{
 mount(false,{selfBookingEnabled:false,assignedSchedulingEnabled:true},null,true);
 act(()=>[...document.querySelectorAll('nav button')].find(b=>b.textContent==='體驗設定')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 act(()=>{const kind=document.querySelector<HTMLSelectElement>('[aria-label="收費類型"]')!;kind.value='plan';kind.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(document.querySelector('[data-fee-section="trial"]')).toBeNull();
 expect(document.querySelector('[data-fee-section="pricing"]')!.getAttribute('data-active')).toBe('true');
});

it('music shares pricing and trial sections and saves independent costs without sports fields',async()=>{
 mount(true,undefined,null,true);
 expect(document.querySelector('[aria-label="方案適用方式"]')).toBeNull();expect(document.body.textContent).not.toMatch(/通用卡|開放選課|計費方式/);
 fill(document.querySelector<HTMLInputElement>('input[name="price"]')!,'800');fill(document.querySelector<HTMLInputElement>('input[name="storeCost"]')!,'200');fill(input('體驗價'),'300');fill(input('體驗店家成本'),'120');fill(input('體驗時間'),'30');
 fill(input('教師拆帳比例'),'45');
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.save.mock.calls[0][0]).toMatchObject({price:800,storeCost:200,unit:'SESSION',musicTerms:1,musicSetup:{musicTeacherShare:0.45},chargeSettings:{trialPrice:300,trialStoreCost:120,trialDuration:30,providerIds:['teacher']}});
 expect(document.body.textContent).toContain('未扣教師費');
});
it('music preserves period sizes and bonus lessons when editing an existing fee price',async()=>{
 mount(true,undefined,{id:'fee',name:'鋼琴兩期',points:12,price:8000,storeCost:200,validDays:140,isActive:true,unit:'SESSION',templateIds:['template'],musicTerms:2,musicTermSizes:[5,5],musicBonusLessons:2,chargeSettings:{kind:'plan',durationMinutes:60,trialPrice:null,trialDuration:null,providerIds:['teacher']}},true);
 expect(document.body.textContent).toContain('總堂數（保留期別）');expect(document.querySelector('[data-fee-section="trial"]')).toBeNull();
 fill(document.querySelector<HTMLInputElement>('input[name="price"]')!,'8001');
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.save.mock.calls[0][0]).toMatchObject({points:12,price:8001,validDays:140,musicTerms:2,musicBonusLessons:2,musicSetup:{musicTermLessons:5,musicValidityDaysPerTerm:70,totalPrice:8001}});
});
