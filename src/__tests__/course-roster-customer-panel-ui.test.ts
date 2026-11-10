// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/course-roster-customer',()=>({loadCourseRosterCustomer:m.read}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/hq/dashboard/courses',useSearchParams:()=>new URLSearchParams('date=2026-11-16&scheduleView=month')}));
vi.mock('@/components/admin/right-sheet',()=>({RightSheet:({children}:{children:unknown})=>h('aside',{},children as never)}));
vi.mock('@/components/customer-labels',()=>({CustomerLabelsSeed:({children}:{children:unknown})=>children}));
vi.mock('@/app/(dashboard)/dashboard/courses/purchase-recovery',()=>({CoursePurchaseIntentProvider:({children}:{children:unknown})=>children}));
vi.mock('@/app/(dashboard)/dashboard/courses/member-workspace-entry',()=>({CourseMemberWorkspaceEntry:({initialCustomerId,initialCardId,panelOnly,onPanelClose}:{initialCustomerId:string;initialCardId?:string;panelOnly:boolean;onPanelClose:()=>void})=>h('aside',{'data-student':initialCustomerId,'data-card':initialCardId,'data-panel-only':String(panelOnly)},h('button',{onClick:onPanelClose},'關閉學員'))}));
import {RosterCustomerPanel} from '@/app/(dashboard)/dashboard/courses/roster-customer-panel';
const customer={id:'student',name:'學員甲',phone:'0912000000',cardId:'card-1'};
const data=(id='student')=>({success:true,data:{workspaceProps:{initialCustomerId:id},labelSnapshot:{},recoveryEnabled:false,storeId:'store'}});
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});window.history.replaceState(null,'','/hq/dashboard/courses?date=2026-11-16&scheduleView=month');});
it('先顯示學員摘要，原網址與課表保持不動；成功後同窗載入指定方案',async()=>{
 let resolve!:(value:unknown)=>void;m.read.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const close=vi.fn();const url=location.href;
 try{
  await act(async()=>root.render(h('main',{},h('div',{'data-calendar':true},'原課表'),h(RosterCustomerPanel,{customer,sessionId:'session',storeId:'store',onClose:close}))));
  expect(document.body.textContent).toContain('學員甲');expect(document.body.textContent).toContain('讀取學員資料中');expect(host.textContent).not.toContain('讀取學員資料中');expect(location.href).toBe(url);
  await act(async()=>resolve(data()));
  expect(document.body.querySelector('[data-panel-only="true"]')?.getAttribute('data-card')).toBe('card-1');expect(host.querySelector('[data-calendar]')?.textContent).toBe('原課表');expect(location.href).toBe(url);
  await act(async()=>document.body.querySelector<HTMLButtonElement>('button')!.click());expect(close).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('換學員後忽略前一位晚到結果，失敗可在原窗重試',async()=>{
 let oldResolve!:(v:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(r=>{oldResolve=r;})).mockResolvedValueOnce({success:false,error:'網路失敗'}).mockResolvedValueOnce(data('second'));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const view=(id:string)=>h(RosterCustomerPanel,{key:id,customer:{...customer,id},sessionId:'session',storeId:'store',onClose:vi.fn()});
 try{
  await act(async()=>root.render(view('first')));await act(async()=>root.render(view('second')));expect(document.body.textContent).toContain('網路失敗');
  await act(async()=>oldResolve(data('first')));expect(document.body.querySelector('[data-student]')).toBeNull();
  await act(async()=>Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent==='重試')!.click());
  expect(document.body.querySelector('[data-student]')?.getAttribute('data-student')).toBe('second');
 }finally{await act(async()=>root.unmount());host.remove();}
});
