// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/courses",useSearchParams:()=>new URLSearchParams(),useRouter:()=>({replace:vi.fn()})}));
vi.mock("@/server/actions/course-customer-attribution",()=>({bulkAssignCourseCustomers:vi.fn()}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customers-table",()=>({CustomersTable:()=>null,isInactiveRow:()=>false}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/bulk-assign-bar",()=>({BulkAssignBar:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customers-toolbar",()=>({CustomersToolbar:({trailing}:{trailing:React.ReactNode})=>createElement("div",null,trailing)}));
import {CourseCustomerList} from "@/app/(dashboard)/dashboard/courses/customer-list";
it("sports list keeps purchasing in the existing menu with permission, without changing music",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const purchase=vi.fn();const props={rows:[],cards:[],canReadCards:true,onView:vi.fn(),onPurchase:purchase,sportsNative:true};
 await act(async()=>root.render(createElement(CourseCustomerList,props)));expect(document.body.textContent).not.toContain("購買方案");
 await act(async()=>(host.querySelector('button[aria-label="顧客管理更多操作"]') as HTMLButtonElement).click());
 const buy=[...document.body.querySelectorAll('button')].find(b=>b.textContent==="購買方案")!;expect(buy).toBeTruthy();await act(async()=>buy.click());expect(purchase).toHaveBeenCalledOnce();
 await act(async()=>root.render(createElement(CourseCustomerList,{...props,onPurchase:undefined})));expect(host.querySelector('button')).toBeNull();
 await act(async()=>root.render(createElement(CourseCustomerList,{...props,sportsNative:false})));expect(host.querySelector('button')).toBeNull();
 await act(async()=>root.unmount());host.remove();
});
