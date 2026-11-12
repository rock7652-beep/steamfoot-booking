// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({load:vi.fn()}));
vi.mock("@/server/actions/customer-panel-context",()=>({getCustomerPanelContext:m.load}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-detail-drawer-content",()=>({CustomerDetailDrawerContent:({titleId}:{titleId:string})=>createElement("h2",{id:titleId},"測試顧客")}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/hq/dashboard/bookings',useSearchParams:()=>new URLSearchParams()}));
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
import {useCustomerPanelContextReader} from '@/components/admin/use-customer-panel-context-reader';
import { CustomerInlineDetail } from "@/app/(dashboard)/dashboard/customers/_components/customer-inline-detail";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);vi.clearAllMocks();vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:()=>m.load(new URL(url,"https://test").searchParams.get("customerId"))})));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it("keeps the booking dialog label present while loading and after customer data resolves",async()=>{
  let resolve!:(value:unknown)=>void;m.load.mockReturnValue(new Promise(r=>{resolve=r;}));
  await act(async()=>root.render(createElement(CustomerInlineDetail,{customerId:"customer-a",readOnly:false,onBack:vi.fn(),onUpdated:vi.fn(),labelledById:"booking-drawer-title"})));
  expect(document.getElementById("booking-drawer-title")?.textContent).toBe("顧客資料");
  await act(async()=>resolve({success:true,data:{customer:{id:"customer-a"},readOnly:false}}));
  expect(document.getElementById("booking-drawer-title")?.textContent).toBe("測試顧客");
  expect(m.load).toHaveBeenCalledWith("customer-a");
});

it('booking context preload supplies the real customer panel without a second request or loader',async()=>{
 m.load.mockResolvedValue({success:true,data:{customer:{id:'customer-a'},readOnly:false}});
 function App({open=false}:{open?:boolean}){const reader=useCustomerPanelContextReader('booking-scope');return createElement('div',null,createElement('button',{onClick:()=>reader.read('customer-a')},'preload'),open?createElement(CustomerInlineDetail,{customerId:'customer-a',readScope:'booking-scope',readOnly:false,onBack:vi.fn(),onUpdated:vi.fn()}):null);}
 await act(async()=>root.render(createElement(PanelReadProvider,null,createElement(App,{}))));
 await act(async()=>host.querySelector('button')!.click());expect(m.load).toHaveBeenCalledOnce();
 await act(async()=>root.render(createElement(PanelReadProvider,null,createElement(App,{open:true}))));
 expect(host.textContent).toContain('測試顧客');expect(host.textContent).not.toContain('讀取顧客資料中');expect(m.load).toHaveBeenCalledOnce();
});
