// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/course-roster-customer',()=>({loadCourseRosterCustomer:m.read}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/hq/dashboard/courses',useSearchParams:()=>new URLSearchParams('date=2026-11-16&scheduleView=month')}));
vi.mock('@/components/admin/right-sheet',()=>({RightSheet:({children}:{children:unknown})=>h('aside',{},children as never)}));
vi.mock('@/components/customer-labels',()=>({CustomerLabelsSeed:({children}:{children:unknown})=>children}));
vi.mock('@/app/(dashboard)/dashboard/courses/purchase-recovery',()=>({CoursePurchaseIntentProvider:({children}:{children:unknown})=>children}));
vi.mock('@/app/(dashboard)/dashboard/courses/member-workspace-entry',()=>({CourseMemberWorkspaceEntry:({initialCustomerId,initialCardId,panelOnly,onPanelClose}:{initialCustomerId:string;initialCardId?:string;panelOnly:boolean;onPanelClose:()=>void})=>h('aside',{'data-student':initialCustomerId,'data-card':initialCardId,'data-panel-only':String(panelOnly)},h('button',{onClick:onPanelClose},'關閉學員'))}));
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
import {useRosterCustomerReader} from '@/components/admin/use-roster-customer-reader';
import {RosterCustomerPanel} from '@/app/(dashboard)/dashboard/courses/roster-customer-panel';
const customer={id:'student',name:'學員甲',phone:'0912000000',cardId:'card-1'};
const data=(id='student')=>({success:true,data:{workspaceProps:{initialCustomerId:id},labelSnapshot:{},recoveryEnabled:false,storeId:'store'}});
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:()=>m.read(JSON.parse(new URL(url,"https://test").searchParams.get("args")!))})));Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});window.history.replaceState(null,'','/hq/dashboard/courses?date=2026-11-16&scheduleView=month');});
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

afterEach(()=>vi.unstubAllGlobals());
it('預讀與點擊方案共用整份資料，首次開窗沒有讀取占位且不另發請求',async()=>{
 m.read.mockResolvedValue(data());
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function App({open=false}:{open?:boolean}){const reader=useRosterCustomerReader('session','store');return h('main',null,h('button',{onClick:()=>reader.read(JSON.stringify(['student','card-1']))},'預讀名單方案'),open?h(RosterCustomerPanel,{customer,sessionId:'session',storeId:'store',onClose:vi.fn()}):null);}
 try{
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{}))));
  await act(async()=>host.querySelector('button')!.click());expect(m.read).toHaveBeenCalledOnce();
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{open:true}))));
  expect(document.body.querySelector('[data-card="card-1"]')).not.toBeNull();expect(document.body.textContent).not.toContain('讀取學員資料中');expect(m.read).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());host.remove();}
});
