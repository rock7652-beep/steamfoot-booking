// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({push:vi.fn(),refresh:vi.fn(),book:vi.fn(),slots:vi.fn(),plan:vi.fn(),status:vi.fn(),records:vi.fn(),role:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:m.push,refresh:m.refresh,replace:vi.fn()}),usePathname:()=>'/s/test/beauty',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/server/actions/beauty',()=>({bookBeautyParty:m.book,submitBeautyTrial:m.book,readBeautySlots:m.slots,requestBeautyPlan:m.plan,changeBeautyStatus:m.status}));
vi.mock('@/components/course-health-workspace',()=>({CourseHealthWorkspace:()=>h('section',null,'健康追蹤內容')}));
vi.mock('@/server/actions/beauty-member',()=>({saveBeautyMemberProfile:vi.fn(),saveBeautyMemberPassword:vi.fn()}));
vi.mock('@/lib/beauty/portal-role-read',()=>({readBeautyPortalRole:m.role}));
vi.mock('@/lib/beauty/portal-detail-read',()=>({readBeautyCardHistory:vi.fn(),readBeautyOwnIncome:vi.fn(),readBeautyWorkRecords:m.records}));
vi.mock('@/server/actions/auth',()=>({logoutAction:vi.fn()}));
vi.mock('@/components/image-announcements/carousel',()=>({StoreImageAnnouncements:()=>h('div',{'data-testid':'announcements'})}));
vi.mock('@/components/beauty/reschedule-panel',()=>({BeautyReschedulePanel:({onSaved}:{onSaved:()=>void})=>h('button',{onClick:onSaved},'模擬改期成功')}));
import {BeautyBookingForm} from '@/components/beauty/booking-form';
import {BeautyPortal} from '@/components/beauty/portal';
import type {BeautyPortalData} from '@/server/beauty/queries';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const roots:{root:ReturnType<typeof createRoot>;host:HTMLDivElement}[]=[];
function mount(node:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});act(()=>root.render(node));return host;}
function button(host:HTMLElement,name:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===name);if(!b)throw new Error('Missing '+name);return b;}
function field(host:HTMLElement,name:string){const label=[...host.querySelectorAll('label')].find(l=>l.textContent?.trim().startsWith(name));if(!label)throw new Error('Missing '+name);return label.querySelector('input,select,textarea') as HTMLInputElement|HTMLSelectElement;}
function set(el:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement,value:string){act(()=>{const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
const catalog={services:[{id:'service',name:'做臉',duration:60,price:1000,trialPrice:500}],techs:[]};
const data={...catalog,store:{id:'store',slug:'test',name:'測試店'},canWork:true,work:false,customer:{id:'person',name:'顧客',phone:'0900000000'},cards:[],members:[],items:[],plans:[],purchases:[],grants:[],income:[],bank:null,policy:{selfBooking:true,selfCancel:true,selfReschedule:true}} as unknown as BeautyPortalData;
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-21T02:00:00Z'));vi.spyOn(window,'scrollTo').mockImplementation(()=>{});m.role.mockImplementation(async(work:boolean)=>({success:true,data:{...data,work}}));m.records.mockResolvedValue({success:true,data:{items:[],hasMore:false}});m.plan.mockResolvedValue({success:true});m.status.mockResolvedValue({success:true});m.book.mockResolvedValue({success:true,data:{groupId:'new-group',ids:['one','two']}});m.slots.mockResolvedValue({success:true,data:{slots:['09:00','10:00']}});});
afterEach(()=>{for(const {root,host}of roots.splice(0)){act(()=>root.unmount());host.remove();}vi.restoreAllMocks();vi.useRealTimers();});
it('starts on the selected calendar date, validates a seeded time against fresh slots',async()=>{
 const host=mount(h(BeautyBookingForm,{catalog,mode:'manager',slug:'test',initialDate:'2026-10-27',initialTime:'10:00',customer:data.customer}));
 expect(field(host,'日期').value).toBe('2026-10-27');await act(async()=>button(host,'查詢時段').click());
 expect(m.slots.mock.calls[0][2].date).toBe('2026-10-27');expect(field(host,'開始時間').value).toBe('10:00');expect(m.book).not.toHaveBeenCalled();
});
it('does not accept a seeded time absent from the authoritative slot response',async()=>{
 const host=mount(h(BeautyBookingForm,{catalog,mode:'manager',slug:'test',initialDate:'2026-10-27',initialTime:'12:00',customer:data.customer}));await act(async()=>button(host,'查詢時段').click());expect(field(host,'開始時間').value).toBe('');
});
it('keeps a multi-person draft and selected day when visiting another member page',async()=>{
 const host=mount(h(BeautyPortal,{data}));act(()=>button(host,'立即預約').click());set(field(host,'預約人數'),'2');const notes=host.querySelectorAll('textarea');set(notes[0],'保留第一人');set(notes[1],'保留第二人');await act(async()=>button(host,'查詢可用時段').click());await act(async()=>set(field(host,'日期'),'2026-10-27'));act(()=>button(host,'我的').click());act(()=>button(host,'預約').click());expect(field(host,'日期').value).toBe('2026-10-27');expect(field(host,'預約人數').value).toBe('2');expect((host.querySelectorAll('textarea')[0] as HTMLTextAreaElement).value).toBe('保留第一人');expect((host.querySelectorAll('textarea')[1] as HTMLTextAreaElement).value).toBe('保留第二人');
});
it('asks before dropping a draft through an identity switch',()=>{
 const host=mount(h(BeautyPortal,{data}));act(()=>button(host,'立即預約').click());set(host.querySelector('textarea') as unknown as HTMLInputElement,'未送出');const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);act(()=>button(host,'我的工作').click());expect(confirm).toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();
});

it('uses a guarded bank transfer sheet instead of a browser prompt',async()=>{
 const withPlan={...data,bank:{bankName:'測試銀行',bankCode:'000',bankAccountNumber:'12345678'},plans:[{id:'plan',name:'五次方案',sessions:5,price:4500}]} as BeautyPortalData;
 const host=mount(h(BeautyPortal,{data:withPlan}));act(()=>button(host,'我的').click());act(()=>button(host,'我的方案 ›').click());act(()=>button(host,'購買方案').click());act(()=>button(host,'購買方案').click());const sheet=host.querySelector('[role="dialog"]') as HTMLElement;expect(sheet).not.toBeNull();set(field(sheet,'轉出帳號後四碼'),'123');expect(button(sheet,'已匯款，送出核帳資料').disabled).toBe(true);set(field(sheet,'轉出帳號後四碼'),'1234');await act(async()=>button(sheet,'已匯款，送出核帳資料').click());expect(m.plan).toHaveBeenCalledOnce();expect(m.plan.mock.calls[0][0]).toMatchObject({planId:'plan',lastFour:'1234'});expect(host.textContent).toContain('核帳資料已送出');
});
it('groups companions but cancels only the selected service item through the confirmation sheet',async()=>{
 const item={startsAt:'2026-10-27T01:00:00Z',endsAt:'2026-10-27T02:00:00Z',status:'RESERVED',groupId:'group',revision:0,technicianId:'tech',cancelDeduct:false,noShowDeduct:false,notes:'',preference:'ANY',price:1000,isTrial:false,customerId:'person'};
 const withParty={...data,items:[{...item,id:'one',personName:'本人',serviceName:'做臉'},{...item,id:'two',personName:'同行者',serviceName:'按摩'}]} as BeautyPortalData;
 const host=mount(h(BeautyPortal,{data:withParty}));act(()=>button(host,'我的預約').click());expect(host.querySelectorAll('.beauty-booking-card')).toHaveLength(1);const cancellations=[...host.querySelectorAll('button')].filter(b=>b.textContent==='取消');act(()=>cancellations[1].click());const sheet=host.querySelector('[role="dialog"]') as HTMLElement;expect(sheet.querySelector('textarea')).toBeNull();await act(async()=>button(sheet,'確認取消').click());expect(m.status).toHaveBeenCalledOnce();expect(m.status.mock.calls[0]).toMatchObject(['member',{id:'two',target:'CANCELLED'}]);
});
it('hides customer cancellation and rescheduling when store policy disables them',()=>{
 const item={id:'one',startsAt:'2026-10-27T01:00:00Z',endsAt:'2026-10-27T02:00:00Z',status:'RESERVED',groupId:'group',revision:0,personName:'本人',serviceName:'做臉',technicianId:'tech',cancelDeduct:false,noShowDeduct:false};
 const host=mount(h(BeautyPortal,{data:{...data,policy:{...data.policy,selfCancel:false,selfReschedule:false},items:[item]} as BeautyPortalData}));act(()=>button(host,'我的預約').click());expect([...host.querySelectorAll('button')].some(b=>b.textContent==='取消'||b.textContent==='改期')).toBe(false);
});
it('keeps completed technician cards read-only without a correction or empty more menu',()=>{
 const item={id:'worker-item',startsAt:'2026-10-21T01:00:00Z',endsAt:'2026-10-21T02:00:00Z',status:'COMPLETED',groupId:'group',revision:3,personName:'本人',serviceName:'做臉',technicianId:'tech'};
 const host=mount(h(BeautyPortal,{data:{...data,work:true,grants:['complete'],items:[item]} as BeautyPortalData}));expect(host.textContent).toContain('已完成');expect(host.textContent).not.toContain('更正回預約');expect(host.textContent).not.toContain('恢復預約');expect(host.querySelector('.beauty-work-card details')).toBeNull();expect(m.status).not.toHaveBeenCalled();
});

it('blocks the next action after rescheduling until fresh authoritative props arrive',async()=>{
 const item={id:'moving',startsAt:'2026-10-27T01:00:00Z',endsAt:'2026-10-27T02:00:00Z',status:'RESERVED',groupId:'group',revision:0,personName:'本人',serviceName:'做臉',technicianId:'tech',cancelDeduct:false,noShowDeduct:false};
 const first={...data,items:[item]} as BeautyPortalData;const host=mount(h(BeautyPortal,{data:first}));act(()=>button(host,'我的預約').click());act(()=>button(host,'改期').click());act(()=>button(host,'模擬改期成功').click());expect(m.refresh).toHaveBeenCalledOnce();expect(button(host,'取消').disabled).toBe(true);expect(button(host,'首頁').disabled).toBe(true);expect(host.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
 const fresh={...first,items:[{...item,revision:1,startsAt:'2026-10-28T01:00:00Z'}]} as BeautyPortalData;act(()=>roots[0].root.render(h(BeautyPortal,{data:fresh})));expect(button(host,'取消').disabled).toBe(false);expect(button(host,'首頁').disabled).toBe(false);act(()=>button(host,'取消').click());const sheet=host.querySelector('[role="dialog"]') as HTMLElement;expect(sheet.querySelector('textarea')).toBeNull();await act(async()=>button(sheet,'確認取消').click());expect(m.status.mock.calls[0]).toMatchObject(['member',{id:'moving',revision:1}]);
});

it('keeps the member form identity-free and reveals names only after choosing a technician',()=>{
 const host=mount(h(BeautyBookingForm,{mode:'member',slug:'test',catalog:{...catalog,techs:[{id:'tech',name:'王老師',gender:'FEMALE',serviceIds:['service']}]},customer:data.customer}));
 expect(host.textContent).not.toContain('預約類型');expect(host.textContent).not.toContain('技師性別');expect(host.querySelector('input[type="tel"]')).toBeNull();expect(host.textContent).not.toContain('王老師');const specified=[...host.querySelectorAll('input[type="radio"]')][1] as HTMLInputElement;act(()=>specified.click());expect(host.textContent).toContain('王老師（女）');
});
it('shows half-hour choices, full per-service ranges, cash only totals and a useful receipt',async()=>{
 const host=mount(h(BeautyBookingForm,{mode:'member',slug:'test',catalog:{...catalog,services:[{...catalog.services[0],duration:75}]},customer:data.customer}));m.slots.mockResolvedValue({success:true,data:{slots:['09:00','09:15','09:30']}});await act(async()=>button(host,'查詢可用時段').click());expect(host.textContent).not.toContain('09:15');act(()=>button(host,'09:30').click());act(()=>button(host,'下一步').click());expect(host.textContent).toContain('09:30–10:45');expect(host.querySelectorAll('[aria-label="預約摘要"] h2')).toHaveLength(1);await act(async()=>button(host,'確認預約').click());expect(m.book).toHaveBeenCalledOnce();const payload=m.book.mock.calls[0][1];expect(payload).not.toHaveProperty('contactName');expect(payload.people[0]).not.toHaveProperty('name');expect(payload.people[0]).not.toHaveProperty('phone');expect(payload.people[0]).not.toHaveProperty('preference');expect(host.textContent).toContain('預約成功');expect(button(host,'查看我的預約')).toBeDefined();
});
it('prefers the soonest eligible plan and requires explicit correction after the date makes it invalid',async()=>{
 const card={id:'later',name:'較晚到期',remaining:3,held:0,expiresAt:'2026-12-01T00:00:00Z',closed:false,memberIds:['person'],serviceIds:['service'],allowShared:true};const cards=[card,{...card,id:'soon',name:'即將到期',expiresAt:'2026-10-22T16:00:00Z'}];
 const host=mount(h(BeautyBookingForm,{mode:'member',slug:'test',catalog,customer:data.customer,cards}));expect((host.querySelector('[aria-label="方案 1"]') as HTMLSelectElement).value).toBe('soon');await act(async()=>button(host,'查詢可用時段').click());m.slots.mockClear();await act(async()=>set(field(host,'日期'),'2026-10-24'));expect(m.slots).not.toHaveBeenCalled();expect(host.textContent).toContain('請返回修改方案');expect((host.querySelector('[aria-label="方案 1"]') as HTMLSelectElement).value).toBe('soon');
});
it('does not allocate the same last shared session to two people',()=>{
 const cards=[{id:'last',name:'剩最後一次',remaining:1,held:0,expiresAt:'2026-12-01T00:00:00Z',closed:false,memberIds:['person'],serviceIds:['service'],allowShared:true}];const host=mount(h(BeautyBookingForm,{mode:'member',slug:'test',catalog,customer:data.customer,cards}));set(field(host,'預約人數'),'2');expect((host.querySelector('[aria-label="方案 1"]') as HTMLSelectElement).value).toBe('last');expect((host.querySelector('[aria-label="方案 2"]') as HTMLSelectElement).value).toBe('');expect(host.querySelector('[aria-label="方案 2"] option[value="last"]')).toBeNull();
});
it('retries a failed submission with the same request key while preserving the summary',async()=>{
 const host=mount(h(BeautyBookingForm,{mode:'member',slug:'test',catalog,customer:data.customer}));await act(async()=>button(host,'查詢可用時段').click());act(()=>button(host,'09:00').click());act(()=>button(host,'下一步').click());m.book.mockResolvedValueOnce({success:false,error:'請重試'});await act(async()=>button(host,'確認預約').click());const first=m.book.mock.calls[0][1].requestKey;expect(host.textContent).toContain('請重試');await act(async()=>button(host,'確認預約').click());expect(m.book.mock.calls[1][1].requestKey).toBe(first);
});

it('shows five navigation icons only with health enabled and removes home booking duplication',()=>{
 const host=mount(h(BeautyPortal,{data:{...data,healthEnabled:true} as BeautyPortalData}));expect(host.querySelectorAll('nav[aria-label="主要功能"] button')).toHaveLength(5);act(()=>button(host,'健康').click());expect(host.textContent).toContain('健康追蹤內容');act(()=>button(host,'首頁').click());expect(host.querySelectorAll('.beauty-booking-card')).toHaveLength(0);
 act(()=>roots[0].root.render(h(BeautyPortal,{data:{...data,healthEnabled:false} as BeautyPortalData})));expect(host.querySelectorAll('nav[aria-label="主要功能"] button')).toHaveLength(4);
});
it('keeps service and time on the first page and invalidates a chosen time when service changes',async()=>{
 const host=mount(h(BeautyBookingForm,{mode:'member',slug:'test',catalog,customer:data.customer}));expect(field(host,'日期')).toBeDefined();expect(field(host,'預約人數')).toBeDefined();await act(async()=>button(host,'查詢可用時段').click());act(()=>button(host,'09:00').click());expect(button(host,'09:00').getAttribute('aria-pressed')).toBe('true');expect(button(host,'下一步').disabled).toBe(false);set(field(host,'預約人數'),'2');expect(button(host,'下一步').disabled).toBe(true);expect(host.textContent).not.toContain('確認預約');
});

it('shows a compact worker card with a visual-only service status and confirmation-only completion',async()=>{
 const item={id:'work',startsAt:'2026-10-21T01:45:00Z',endsAt:'2026-10-21T02:45:00Z',status:'RESERVED',groupId:'g',revision:2,personName:'王小姐',serviceName:'按摩',technicianId:'tech',locationId:'room',cardId:'card',notes:'肩頸較敏感',cancelDeduct:false,noShowDeduct:false};
 const host=mount(h(BeautyPortal,{data:{...data,work:true,grants:['complete','cancel','reschedule'],locations:[{id:'room',name:'A室'}],items:[item]} as BeautyPortalData}));const card=host.querySelector('.beauty-work-card')!;
 expect(card.textContent).toContain('服務中');expect(card.textContent).toContain('09:45–10:45');expect(card.textContent).toContain('王小姐 · 按摩');expect(card.textContent).toContain('空間：A室');expect(card.textContent).not.toContain('技師：');expect(card.textContent).not.toContain('取消規則');expect(host.textContent).not.toContain('下一筆服務');expect(host.querySelector('[data-testid=announcements]')).not.toBeNull();expect(card.querySelectorAll('h2')).toHaveLength(1);expect(m.status).not.toHaveBeenCalled();
 act(()=>button(host,'服務完成').click());const sheet=host.querySelector('[role="dialog"]') as HTMLElement;expect(sheet.querySelector('textarea')).toBeNull();expect(sheet.textContent).toContain('本次扣 1 次');await act(async()=>button(sheet,'確認').click());expect(m.status.mock.calls[0]).toMatchObject(['work',{id:'work',revision:2,target:'COMPLETED'}]);expect(m.status.mock.calls[0][1]).not.toHaveProperty('reason');
});
it('restores role views after a fresh authorized read without rerunning the full route',async()=>{
 const host=mount(h(BeautyPortal,{data}));act(()=>button(host,'會員').click());expect(m.role).not.toHaveBeenCalled();act(()=>button(host,'我的').click());await act(async()=>button(host,'我的工作').click());expect(m.role).toHaveBeenCalledWith(true,'test');expect(m.push).not.toHaveBeenCalled();expect(host.querySelector('h1')?.textContent).toBe('今日工作');await act(async()=>button(host,'服務紀錄').click());await act(async()=>button(host,'會員').click());expect(host.querySelector('h1')?.textContent).toBe('我的');await act(async()=>button(host,'我的工作').click());expect(host.querySelector('h1')?.textContent).toBe('服務紀錄');
});
it('leaves the existing role visible and reports an authorization failure without exposing work data',async()=>{
 const host=mount(h(BeautyPortal,{data}));m.role.mockResolvedValue({success:false,error:'技師工作身分尚未開放'});await act(async()=>button(host,'我的工作').click());expect(host.querySelector('h1')?.textContent).toBe('會員首頁');expect(host.textContent).toContain('技師工作身分尚未開放');
});
it('discards loaded record details after a fresh authority revision even when summary items are unchanged',async()=>{
 const item={id:'private-record',startsAt:'2026-10-20T01:00:00Z',endsAt:'2026-10-20T02:00:00Z',status:'COMPLETED',groupId:'group',revision:0,personName:'舊權限顧客',serviceName:'做臉',technicianId:'tech'};
 m.records.mockResolvedValue({success:true,data:{items:[item],hasMore:false}});const first={...data,work:true,readVersion:'first',grants:['complete']} as BeautyPortalData;const host=mount(h(BeautyPortal,{data:first}));await act(async()=>button(host,'服務紀錄').click());expect(host.textContent).toContain('舊權限顧客');m.records.mockResolvedValue({success:false,error:'權限已停用'});await act(async()=>roots[0].root.render(h(BeautyPortal,{data:{...first,readVersion:'second',grants:[]}})));expect(host.textContent).not.toContain('舊權限顧客');expect(host.textContent).toContain('權限已停用');
});

it('honors a direct income month and preserves a changed month when switching roles',async()=>{
 const work={...data,work:true,incomeMonth:'2026-09',grants:[]} as BeautyPortalData;m.role.mockImplementation(async(workMode:boolean)=>({success:true,data:{...work,work:workMode}}));const host=mount(h(BeautyPortal,{data:work,initialView:'income'}));expect(field(host,'月份').value).toBe('2026-09');set(field(host,'月份'),'2026-08');await act(async()=>button(host,'會員').click());await act(async()=>button(host,'我的工作').click());expect(host.querySelector('h1')?.textContent).toBe('我的收入');expect(field(host,'月份').value).toBe('2026-08');
});

it('carries the calendar technician and location into authoritative slot queries',async()=>{
 const seededCatalog={...catalog,techs:[{id:'tech',name:'技師',gender:'FEMALE',serviceIds:['service']}],locations:[{id:'room-selected',name:'指定位置'}]};
 const host=mount(h(BeautyBookingForm,{catalog:seededCatalog,mode:'manager',slug:'test',initialDate:'2026-10-27',initialTime:'10:00',initialTechnicianId:'tech',initialLocationId:'room-selected',customer:data.customer}));
 expect((host.querySelector('[aria-label="第1位位置"]') as HTMLSelectElement).value).toBe('room-selected');
 await act(async()=>button(host,'查詢時段').click());
 expect(m.slots.mock.calls[0][2].people[0]).toMatchObject({specifiedTechnicianId:'tech',specifiedLocationId:'room-selected'});
});

it('uses the chosen first customer as contact without duplicate inputs, and invalidates slots when opting into another contact',async()=>{
 const host=mount(h(BeautyBookingForm,{catalog,mode:'manager',slug:'test',members:[data.customer!]}));
 set(field(host,'服務者'),'person');
 expect([...host.querySelectorAll('label')].some(l=>l.textContent?.trim()==='聯絡人姓名')).toBe(false);
 await act(async()=>button(host,'查詢時段').click());
 expect(m.slots.mock.calls[0][2]).toMatchObject({contactName:'顧客',phone:'0900000000',people:[expect.objectContaining({customerId:'person',preference:'ANY'})]});
 act(()=>field(host,'另設聯絡人').click());
 expect(host.textContent).toContain('聯絡人姓名');expect(host.textContent).not.toContain('開始時間');
 await act(async()=>button(host,'查詢時段').click());expect(m.slots).toHaveBeenCalledOnce();
 set(field(host,'聯絡人姓名'),'代約人');set(field(host,'聯絡人手機'),'0911111111');
 await act(async()=>button(host,'查詢時段').click());expect(m.slots.mock.calls[1][2]).toMatchObject({contactName:'代約人',phone:'0911111111'});expect(m.book).not.toHaveBeenCalled();
});

it('releases a four-person availability read independently and ignores an older query still in flight',async()=>{
 let finishOld:(value:unknown)=>void=()=>{},finishNew:(value:unknown)=>void=()=>{};
 m.slots.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{finishNew=resolve;}));
 const onStateChange=vi.fn();const host=mount(h(BeautyBookingForm,{catalog,mode:'member',slug:'test',customer:data.customer,onStateChange}));set(field(host,'預約人數'),'4');
 await act(async()=>button(host,'查詢可用時段').click());expect(host.textContent).toContain('查詢時段中…');expect(onStateChange.mock.calls.at(-1)![0].pending).toBe(true);
 // A replacement date cancels the prior read generation, never waiting for its transport tail.
 await act(async()=>set(field(host,'日期'),'2026-10-29'));await act(async()=>finishNew({success:true,data:{slots:['10:00']}}));expect(button(host,'10:00').disabled).toBe(false);expect(host.textContent).not.toContain('查詢時段中…');expect(onStateChange.mock.calls.at(-1)![0].pending).toBe(false);
 await act(async()=>finishOld({success:true,data:{slots:['09:00']}}));expect(host.textContent).not.toContain('09:00');act(()=>button(host,'10:00').click());expect(button(host,'下一步').disabled).toBe(false);
});
