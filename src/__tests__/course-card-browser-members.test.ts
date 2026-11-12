// @vitest-environment jsdom

vi.mock('@/lib/course-card-read-client',()=>({readNativeCourseCards:mocks.browse,readCourseCardProgress:vi.fn()}));
import { act, createElement } from "react";
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
