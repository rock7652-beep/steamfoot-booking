// @vitest-environment jsdom

vi.mock('@/lib/course-card-read-client',()=>({readNativeCourseCards:mocks.browse,readCourseCardProgress:vi.fn()}));
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ browse: vi.fn() }));
vi.mock("@/server/actions/course-card-reservations",()=>({loadCourseCardReservations:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false,scoped:false})}));
vi.mock("@/server/actions/course-browse", () => ({
  browseCourseCards: mocks.browse,
}));

import { CourseCardBrowser } from "@/app/(dashboard)/dashboard/courses/card-browser";

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

it("shows shared-card members directly on an active plan row", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.browse.mockResolvedValue({
    success: true,
    rows: [{
      id: "card-shared",
      name: "運動十點方案",
      unit: "POINT",
      templateIds: [],
      termSessionIds: [],
      remaining: 8,
      held: 2,
      available: 6,
      closed: false,
      expired: false,
      expiresAt: "2026-12-31T00:00:00.000Z",
      members: [
        { id: "customer-a", name: "Synthetic member A", phone: "SYNTHETIC-CONTACT-A" },
        { id: "customer-b", name: "Synthetic member B", phone: "SYNTHETIC-CONTACT-B" },
      ],
      entries: [],
    }],
    hasMore: true,
    totals: [{unit:"POINT",count:21,remaining:108,held:22,available:86}],
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(createElement(CourseCardBrowser, {
        customerId: "customer-a",
        state: { search: "", history: false, page: 0 },
        onChange: vi.fn(),
        onSelect: vi.fn(),
      }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const row = host.querySelector("tbody tr")!;
    expect(row.textContent).toContain("Synthetic member A、Synthetic member B");
    expect([...row.querySelectorAll("td")].map(cell => cell.textContent)).toEqual([
      expect.stringContaining("運動十點方案"), "8 點", "2 點", "6 點", "2026-12-31", "明細",
    ]);
    expect(host.textContent).toContain("共同餘額");
    expect(host.textContent).toContain("有效方案合計 · 21 個");
    expect(host.textContent).toContain("總剩餘 108 點 · 已預約 22 · 可用 86");
    expect(host.textContent).not.toContain("還可預約 6 堂");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it.each(["NO_EXPIRY","UNKNOWN"])("labels %s without treating a missing date as unlimited",async kind=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  mocks.browse.mockResolvedValue({success:true,rows:[{id:"synthetic-opening",name:"Synthetic ordinary plan",unit:"SESSION",remaining:2,held:0,available:kind==="NO_EXPIRY"?2:0,closed:false,expired:false,expiresAt:null,expiryKind:kind==="NO_EXPIRY"?kind:undefined,openingImported:true,musicActivatedAt:"2026-09-01",members:[{id:"synthetic-student",name:"Synthetic",phone:""}],entries:[]}],hasMore:false});
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(CourseCardBrowser,{customerId:"synthetic-student",state:{search:"",history:false,page:0},onChange:vi.fn(),onSelect:vi.fn()})));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300));});
    expect(host.textContent).toContain(kind==="NO_EXPIRY"?"無期限":"期初效期待核對");
    expect(host.textContent).not.toContain("2099");
  }finally{await act(async()=>root.unmount());host.remove();}
});

it('uses a confirmed purchase projection once and never displays it for a different learner',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 mocks.browse.mockResolvedValue({success:true,rows:[],hasMore:false,totals:[]});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const snapshot={customerId:'customer-a',revision:1,result:{success:true as const,rows:[],hasMore:false,totals:[]}};
 const render=async(customerId:string)=>act(async()=>{root.render(createElement(CourseCardBrowser,{customerId,revision:1,snapshot,state:{search:'',history:false,page:0},onChange:vi.fn(),onSelect:vi.fn()}));await Promise.resolve();});
 try{await render('customer-a');expect(mocks.browse).not.toHaveBeenCalled();await render('customer-b');await act(async()=>{await new Promise(r=>setTimeout(r,30));});expect(mocks.browse).toHaveBeenCalledWith(expect.objectContaining({customerId:'customer-b'}));}finally{await act(async()=>root.unmount());host.remove();}
});

it('expands history below the same active card and never replaces its grid',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const card=(id:string,expired=false)=>({id,name:id,unit:'SESSION',remaining:2,held:0,available:expired?0:2,closed:false,expired,expiresAt:'2027-01-01',members:[],entries:[]});
 mocks.browse.mockImplementation(async(input:{history?:boolean})=>({success:true,rows:[card(input.history?'Historical plan':'Active plan',!!input.history)],hasMore:false}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseCardBrowser,{overview:true,customerId:'learner',state:{search:'',history:false,page:0},onChange:vi.fn(),onSelect:vi.fn(),renderProgress:c=>createElement('div',{'data-grid':c.id},'Dates for '+c.id)})));
  await act(async()=>{await new Promise(r=>setTimeout(r,40));});
  const original=host.querySelector('[data-grid="Active plan"]');expect(original).not.toBeNull();
  await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='歷史方案')!.click();});
  // The active grid stays mounted even while history is still loading.
  expect(host.querySelector('[data-grid="Active plan"]')).toBe(original);
  await act(async()=>{await new Promise(r=>setTimeout(r,40));});
  expect(host.querySelector('[data-grid="Historical plan"]')).not.toBeNull();
  expect(host.querySelector('[data-grid="Active plan"]')).toBe(original);
  await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='收合歷史方案')!.click();});
  expect(host.querySelector('[data-grid="Historical plan"]')).toBeNull();
  expect(host.querySelector('[data-grid="Active plan"]')).toBe(original);
  expect(mocks.browse.mock.calls.filter(([input])=>!input.history&&!input.cardId)).toHaveLength(1);
 }finally{await act(async()=>root.unmount());host.remove();}
});


it.each([false,true])('retains an %s history editor and its request key while pending or uncertain',async history=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const row=(historical:boolean)=>({id:historical?'locked-history':'locked-active',name:historical?'Expired QA plan':'Active QA plan',unit:'SESSION' as const,remaining:2,held:0,available:historical?0:2,closed:false,expired:historical,expiresAt:'2027-01-01',members:[],entries:[]});
 mocks.browse.mockImplementation(async(input:{history?:boolean})=>({success:true,rows:[row(!!input.history)],hasMore:true}));
 let nextKey=0;const recovered=vi.fn();
 function Editor({onBlocked}:{onBlocked:(value:boolean)=>void}){
  const [key]=useState(()=>`original-request-${++nextKey}`);
  return createElement('div',{'data-request-key':key},
   createElement('button',{onClick:()=>onBlocked(true)},'送出測試交易'),
   createElement('button',{onClick:()=>onBlocked(true)},'標記結果待確認'),
   createElement('button',{onClick:()=>{recovered(key);onBlocked(false);}},'確認原交易結果'));
 }
 function Harness(){
  const [blocked,setBlocked]=useState(false),[state,setState]=useState({search:'',history:false,page:1});
  return createElement(CourseCardBrowser,{overview:true,browsingBlocked:blocked,customerId:'retain-editor-'+history,state,onChange:setState,onSelect:vi.fn(),renderEditor:card=>(card.id===(history?'locked-history':'locked-active'))?createElement(Editor,{onBlocked:setBlocked}):null});
 }
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const click=async(label:string)=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===label)!.click();});
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,40));});
 try{
  await act(async()=>root.render(createElement(Harness)));await settle();
  if(history){await click('歷史方案');await settle();const section=host.querySelector('[aria-label="歷史方案"]')!;await act(async()=>{[...section.querySelectorAll('button')].find(button=>button.textContent==='下一頁')!.click();});await settle();}
  const editor=host.querySelector('[data-request-key]')!,key=editor.getAttribute('data-request-key');expect(editor).not.toBeNull();
  for(const phase of ['送出測試交易','標記結果待確認']){
   await click(phase);const reads=mocks.browse.mock.calls.length;
   const collapse=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent===(history?'收合歷史方案':'歷史方案'))!;expect(collapse.disabled).toBe(true);await act(async()=>collapse.click());
   for(const input of host.querySelectorAll<HTMLInputElement>('input'))expect(input.disabled).toBe(true);
   for(const button of host.querySelectorAll<HTMLButtonElement>('nav[aria-label="持有方案分頁"] button')){expect(button.disabled).toBe(true);await act(async()=>button.click());}
   await settle();expect(mocks.browse.mock.calls).toHaveLength(reads);expect(host.querySelector('[data-request-key]')).toBe(editor);expect(editor.getAttribute('data-request-key')).toBe(key);
   expect([...editor.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='確認原交易結果')!.disabled).toBe(false);
  }
  await click('確認原交易結果');expect(recovered).toHaveBeenCalledWith(key);expect(host.querySelector('[data-request-key]')).toBe(editor);
  for(const input of host.querySelectorAll<HTMLInputElement>('input'))expect(input.disabled).toBe(false);
  if(history){await click('收合歷史方案');expect(host.querySelector('[data-request-key]')).toBeNull();}
 }finally{await act(async()=>root.unmount());host.remove();}
});
