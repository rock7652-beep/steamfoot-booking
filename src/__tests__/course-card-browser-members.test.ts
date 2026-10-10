// @vitest-environment jsdom

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
    expect(host.textContent).toContain("共卡人：Synthetic member A、Synthetic member B");
    expect(host.textContent).toContain("剩餘 8 點");
    expect(host.textContent).toContain("已預約 2 點額度");
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
