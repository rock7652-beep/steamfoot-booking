// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({periods:vi.fn(),transport:vi.fn(),useReader:vi.fn(),reader:{read:vi.fn(),invalidate:vi.fn()}}));
vi.mock("@/components/operations/panel-read-cache",()=>({usePanelReader:mock.useReader.mockImplementation(()=>mock.reader)}));
vi.mock("@/server/actions/music-periods",()=>({loadMusicPeriods:mock.periods}));
vi.mock("@/lib/music-period-read-client",()=>({readMusicPeriods:mock.transport}));
vi.mock("@/server/actions/course-members",()=>({loadMusicJoinOptions:vi.fn()}));
vi.mock("@/components/admin/course-assignment-payment",()=>({CourseAssignmentPayment:()=>null}));
import {MusicAssignmentPayment} from "@/components/admin/music-assignment-payment";
const plan={id:"guitar",templateIds:["lesson"],validDays:35,points:4,price:3200,musicTerms:1,musicTermSizes:[4]};
it("previews cumulative renewal periods as quantity changes without changing purchase-local form values",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 mock.reader.read.mockResolvedValue({success:true,data:[{planId:"guitar",templateIds:["lesson"],purchaseBatch:1,periodStart:1,musicTermSizes:[4,4]},{planId:"guitar",templateIds:["lesson"],purchaseBatch:2,periodStart:3,musicTermSizes:[4,4]},{planId:"other",templateIds:["lesson"],purchaseBatch:9,periodStart:99,musicTermSizes:[4]}]});
 const host=document.createElement("form");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(MusicAssignmentPayment,{plan,customerId:"student",canDiscount:true,onSummary:vi.fn()})));
  expect(mock.useReader).toHaveBeenCalledWith("music-periods",mock.transport);
  expect(host.textContent).toContain("本次期別第 5 期");
  const quantity=host.querySelector<HTMLInputElement>('input[type="number"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(quantity,"2");quantity.dispatchEvent(new Event("input",{bubbles:true}));});
  expect(host.textContent).toContain("本次期別第 5–6 期");
  expect(new FormData(host).get("musicPurchaseTerms")).toBe("2");
  expect(host.querySelector("tbody")?.textContent).toContain("第 5 期");expect(host.querySelector("tbody")?.textContent).toContain("第 6 期");
 } finally {await act(async()=>root.unmount());host.remove();}
});
it("does not guess cumulative numbering for incomplete historical periods",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});mock.reader.read.mockResolvedValue({success:true,data:[{planId:"guitar",templateIds:["lesson"],purchaseBatch:1,periodStart:null,musicTermSizes:[]}]});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {await act(async()=>root.render(createElement(MusicAssignmentPayment,{plan,customerId:"student",canDiscount:true,onSummary:vi.fn()})));expect(host.textContent).toContain("本次期別期別待確認");expect(host.querySelector("tbody")?.textContent).toContain("本筆第 1 期");}
 finally {await act(async()=>root.unmount());host.remove();}
});
