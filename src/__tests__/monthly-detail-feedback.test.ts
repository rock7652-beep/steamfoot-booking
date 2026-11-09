// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import type {MonthlyAdjustmentSnapshot} from '@/lib/staff-monthly-adjustment';
const m=vi.hoisted(()=>({save:vi.fn(),remove:vi.fn(),refresh:vi.fn()}));
vi.mock('@/server/actions/staff-monthly-adjustment',()=>({saveMonthlyAdjustment:m.save,deleteMonthlyAdjustment:m.remove,changeAdjustmentMonthLock:vi.fn()}));
vi.mock('@/server/actions/course-monthly-settlement',()=>({confirmCourseMonthlySettlement:vi.fn(),saveCourseSettlementSettings:vi.fn(),payCourseProfit:vi.fn(),correctCourseProfit:vi.fn()}));
vi.mock('@/server/actions/course-fee-payment',()=>({payCourseFee:vi.fn(),correctCourseFee:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh}),useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/hq/dashboard/revenue'}));
vi.mock('@/components/admin/modal-panel',()=>({ModalPanel:({open,children}:{open:boolean;children:ReactNode})=>open?children:null}));
import {MonthlyAdjustmentProvider} from '@/components/operations/monthly-adjustment-context';
import {MonthlyAdjustments} from '@/app/(dashboard)/dashboard/service-fee-calculator/monthly-adjustments';
import {MonthlyDetailList} from '@/components/operations/monthly-detail-list';
import {CourseMonthlyReport} from '@/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-client';
const person={id:'tech',name:'合成技師',active:true},row={id:'a3407c3e-4ed7-4b85-8a09-5aa4cb5ecdfa',staffId:'tech',month:'2026-11',date:'2026-11-10',direction:'ADD' as const,amount:100,reason:'原獎勵',revision:1};
const initial=():MonthlyAdjustmentSnapshot=>({storeId:'A',month:'2026-11',rows:[row],revision:1,locked:false});
let root:Root,host:HTMLDivElement;
function tree(snapshot=initial(),canEdit=true){return h(MonthlyAdjustmentProvider,{initial:snapshot,people:[person]},h(CourseMonthlyReport,{detailsOnly:true,feeLabel:'技師拆帳',canEditAdjustments:canEdit,lines:[{kind:'FEE',id:'service',staffId:person.id,name:person.name,label:'肩頸按摩',date:'2026-11-02T01:00:00Z',amount:200,paid:0,issue:null,payments:[]}],confirm:h('button',null,'確認月結'),adjustmentTools:h(MonthlyAdjustments,{storeId:'A',month:'2026-11',rows:snapshot.rows,revision:snapshot.revision,locked:snapshot.locked,people:[person],canEdit,confirmInReport:true,integrated:true})}));}
const button=(text:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)!;
async function click(text:string){await act(async()=>button(text).click());}
async function submit(){await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
async function input(node:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement,value:string){await act(async()=>{const proto=node instanceof HTMLSelectElement?HTMLSelectElement.prototype:node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(node,value);node.dispatchEvent(new Event(node instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
const summary=()=>host.querySelector('[aria-label="人員月結彙總"]')!;
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(tree()));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('commits a new deduction to the date-ordered detail, person and global totals before route refresh',async()=>{
 let finish!:(r:unknown)=>void;m.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await click('＋新增獎勵與調整');const form=host.querySelector('form')!;
 expect([...form.querySelectorAll('label,legend')].map(n=>n.textContent?.trim())).toEqual(expect.arrayContaining(['日期 *','調整方式 *','金額 *','備註 *']));expect(form.textContent).not.toContain('歸屬月份');
 await input(form.querySelector('input[type=date]')!,'2026-11-01');await input(form.querySelector('select')!,'tech');await act(async()=>form.querySelector<HTMLInputElement>('input[value=SUBTRACT]')!.click());await input(form.querySelector('input[type=number]')!,'50');await input(form.querySelector('textarea')!,'出勤調整');await submit();await submit();
 expect(m.save).toHaveBeenCalledOnce();expect(host.textContent).not.toContain('已儲存');expect(host.querySelector('form')).not.toBeNull();const sent=m.save.mock.calls[0][0];const receipt={...initial(),revision:2,rows:[row,{...sent,revision:1}]};
 await act(async()=>finish({success:true,data:receipt}));expect(host.querySelector('form')).toBeNull();expect(host.textContent).toContain('已儲存');expect(summary().textContent).toContain('NT$ 250');expect(host.textContent).toContain('總計NT$ 250');
 expect([...host.querySelectorAll('[data-monthly-line]')].map(n=>n.getAttribute('data-monthly-line'))).toEqual([`ADJUSTMENT:${sent.id}`,'FEE:service',`ADJUSTMENT:${row.id}`]);expect(host.textContent).not.toContain('已付');expect(host.textContent).not.toContain('未付');expect(button('確認月結')).toBeUndefined();expect(m.refresh).toHaveBeenCalledOnce();
 await act(async()=>root.render(tree({...initial(),rows:[]})));expect(summary().textContent).toContain('NT$ 250');expect(host.textContent).toContain('出勤調整');await act(async()=>root.render(tree(receipt)));expect(button('確認月結')).toBeDefined();
});
it('retains a failed edit draft without changing the committed summary',async()=>{
 m.save.mockResolvedValue({success:false,error:'明細已由其他人修改'});await act(async()=>host.querySelector<HTMLButtonElement>(`[data-monthly-line="ADJUSTMENT:${row.id}"] button[aria-expanded]`)!.click());await click('編輯');await input(host.querySelector('textarea')!,'編輯中的備註');await submit();expect(host.querySelector('textarea')!.value).toBe('編輯中的備註');expect(host.textContent).toContain('明細已由其他人修改');expect(summary().textContent).toContain('NT$ 300');expect(m.refresh).not.toHaveBeenCalled();
});
it('deletes from the same editor and immediately updates both summaries',async()=>{
 m.remove.mockResolvedValue({success:true,data:{...initial(),revision:2,rows:[]}});await act(async()=>host.querySelector<HTMLButtonElement>(`[data-monthly-line="ADJUSTMENT:${row.id}"] button[aria-expanded]`)!.click());await click('刪除');await click('確認刪除');expect(summary().textContent).toContain('NT$ 200');expect(host.querySelectorAll('[data-monthly-line]')).toHaveLength(1);expect(host.textContent).not.toContain('原獎勵');
});
it('hides mutations for read-only or locked months',async()=>{
 await act(async()=>root.render(tree(initial(),false)));expect(button('＋新增獎勵與調整')).toBeUndefined();expect(host.querySelector('[data-monthly-line] button[aria-expanded]')).toBeNull();await act(async()=>root.render(tree({...initial(),locked:true})));expect(button('＋新增獎勵與調整')).toBeUndefined();expect(button('重新開啟月結')).toBeDefined();expect(host.querySelector('[data-monthly-line] button[aria-expanded]')).toBeNull();
});

it('keeps unknown amounts unresolved and retains the last calendar day in date order',async()=>{
 await act(async()=>root.render(h(MonthlyDetailList,{feeLabel:'技師拆帳',lines:[{kind:'FEE',id:'last',staffId:'tech',name:'合成技師',label:'月底服務',date:'2026-12-31T15:30:00Z',amount:300,paid:0,issue:null,payments:[]},{kind:'FEE',id:'first',staffId:'tech',name:'合成技師',label:'待核對服務',date:'2026-11-30T16:00:00Z',amount:null,paid:0,issue:null,payments:[]}]})));
 expect([...host.querySelectorAll('[data-monthly-line]')].map(n=>n.getAttribute('data-monthly-line'))).toEqual(['FEE:first','FEE:last']);expect(host.textContent).toContain('12-31 23:30');expect(host.querySelector('[data-monthly-person]')?.textContent).toContain('待核對');expect(host.querySelector('[data-monthly-line="FEE:first"]')?.textContent).toContain('待核對');
});

it('removes an already open editor when edit access is revoked',async()=>{await click('＋新增獎勵與調整');expect(host.querySelector('form')).not.toBeNull();await act(async()=>root.render(tree(initial(),false)));expect(host.querySelector('form')).toBeNull();});
