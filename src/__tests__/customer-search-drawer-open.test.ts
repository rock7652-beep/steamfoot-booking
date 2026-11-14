// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m=vi.hoisted(()=>({replace:vi.fn(),params:new URLSearchParams()}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:m.replace}),usePathname:()=>"/dashboard/customers",useSearchParams:()=>m.params}));
vi.mock("@/components/customer-labels",()=>({CustomerLabelFilter:()=>null}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:({children}:{children:React.ReactNode})=>React.createElement("span",null,children)}));
vi.mock("@/components/navigation-notice",()=>({NavigationNotice:()=>null}));
vi.mock("@/components/customer-instant-search",()=>({CustomerInstantSearch:({onChange,onSelect}:{onChange:(value:string)=>void;onSelect:(customer:{id:string})=>void})=>React.createElement("button",{onClick:()=>{onChange("新搜尋");onSelect({id:"outside"});}},"choose candidate")}));
import {CustomersToolbar} from "@/app/(dashboard)/dashboard/customers/_components/customers-toolbar";
import {CUSTOMER_DRAWER_OPEN_EVENT} from "@/lib/customer-drawer-open";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.useFakeTimers();m.replace.mockReset();m.params=new URLSearchParams("search=kept&page=3");window.history.replaceState(null,"","/dashboard/customers?search=kept&page=3");host=document.createElement("div");root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();});
it("uses the mounted drawer without navigation and prevents the pending search timer from navigating",async()=>{
 const handler=vi.fn((event:Event)=>{event.preventDefault();window.history.pushState(null,"","/dashboard/customers?search=kept&page=3&customerId=outside");});
 window.addEventListener(CUSTOMER_DRAWER_OPEN_EVENT,handler);
 try {
  await act(async()=>root.render(React.createElement(CustomersToolbar,{staffOptions:[],basePath:"/dashboard/customers",instantStoreId:"store"})));
  await act(async()=>host.querySelector("button")!.click());
  await act(async()=>vi.advanceTimersByTime(500));
  expect(handler).toHaveBeenCalledOnce();expect(m.replace).not.toHaveBeenCalled();
  expect(new URLSearchParams(window.location.search).get("page")).toBe("3");
 }finally{window.removeEventListener(CUSTOMER_DRAWER_OPEN_EVENT,handler);}
});
it("retains the existing navigation fallback when no drawer is mounted",async()=>{
 await act(async()=>root.render(React.createElement(CustomersToolbar,{staffOptions:[],basePath:"/dashboard/customers",instantStoreId:"store"})));
 await act(async()=>host.querySelector("button")!.click());
 expect(m.replace).toHaveBeenCalled();
 expect(new URL(m.replace.mock.calls[0][0],"https://test").searchParams.get("customerId")).toBe("outside");
});
