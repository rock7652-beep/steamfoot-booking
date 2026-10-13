// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({load:vi.fn()}));
vi.mock("@/server/actions/customer-panel-context",()=>({getCustomerPanelContext:m.load}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-detail-drawer-content",()=>({CustomerDetailDrawerContent:({titleId}:{titleId:string})=>createElement("h2",{id:titleId},"測試顧客")}));
import { CustomerInlineDetail } from "@/app/(dashboard)/dashboard/customers/_components/customer-inline-detail";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);vi.clearAllMocks();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("keeps the booking dialog label present while loading and after customer data resolves",async()=>{
  let resolve!:(value:unknown)=>void;m.load.mockReturnValue(new Promise(r=>{resolve=r;}));
  await act(async()=>root.render(createElement(CustomerInlineDetail,{customerId:"customer-a",readOnly:false,onBack:vi.fn(),onUpdated:vi.fn(),labelledById:"booking-drawer-title"})));
  expect(document.getElementById("booking-drawer-title")?.textContent).toBe("顧客資料");
  await act(async()=>resolve({success:true,data:{customer:{id:"customer-a"},readOnly:false}}));
  expect(document.getElementById("booking-drawer-title")?.textContent).toBe("測試顧客");
  expect(m.load).toHaveBeenCalledWith("customer-a");
});
