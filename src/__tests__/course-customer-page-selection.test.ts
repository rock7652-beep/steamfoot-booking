// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import type {CustomerRow} from "@/app/(dashboard)/dashboard/customers/_components/customers-table";
const state=vi.hoisted(()=>({query:"view=customers&page=1",table:null as null|{selectedIds:Set<string>;onToggleAll:()=>void}}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams(state.query),usePathname:()=>"/s/a/admin/dashboard/courses",useRouter:()=>({replace:vi.fn(),refresh:vi.fn()})}));
vi.mock("@/server/actions/course-customer-attribution",()=>({bulkAssignCourseCustomers:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customers-toolbar",()=>({CustomersToolbar:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customers-table",()=>({CustomersTable:(props:typeof state.table)=>{state.table=props;return null;},isInactiveRow:()=>false}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/bulk-assign-bar",()=>({BulkAssignBar:()=>null}));
import {CourseCustomerList} from "@/app/(dashboard)/dashboard/courses/customer-list";
it("preserves bulk customer selections on other pages and clears them only when filters change",async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  async function render(id:string,page:number){await act(async()=>root.render(createElement(CourseCustomerList,{rows:[{id} as CustomerRow],cards:[],canReadCards:false,canAssignManager:true,onView:()=>{},customerPage:{page,total:40,rows:[{id,lastVisitAt:null,points:0,sessions:0}]}})));}
  try{
    await render("a",1);await act(async()=>state.table!.onToggleAll());
    state.query="view=customers&page=2";await render("b",2);expect([...state.table!.selectedIds]).toEqual(["a"]);
    await act(async()=>state.table!.onToggleAll());expect([...state.table!.selectedIds]).toEqual(["a","b"]);
    await act(async()=>state.table!.onToggleAll());expect([...state.table!.selectedIds]).toEqual(["a"]);
    state.query="view=customers&search=another";await render("c",1);expect(state.table!.selectedIds.size).toBe(0);
  }finally{await act(async()=>root.unmount());host.remove();}
});
