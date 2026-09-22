// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
vi.mock("@/server/actions/course-browse",()=>({browseCourseCards:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),searchCourseCustomers:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false})}));
vi.mock("@/components/admin/course-batch-selection",()=>({CourseBatchBar:()=>null}));
const m=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/courses",useRouter:()=>({refresh:m.refresh,replace:vi.fn()}),useSearchParams:()=>new URLSearchParams("customerId=person")}));
vi.mock("@/components/admin/right-sheet",()=>({RightSheet:({children}:{children:unknown})=>children}));
vi.mock("@/components/customer-attribution-form",()=>({CustomerAttributionForm:()=>null}));
vi.mock("@/server/actions/course-customer-attribution",()=>({saveCourseCustomerAttribution:vi.fn(),searchCourseReferrerCandidates:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({saveCourseCustomer:m.save,saveCoursePointPlan:vi.fn(),assignCoursePointCard:vi.fn(),setCourseCardMembers:vi.fn()}));
vi.mock("@/server/actions/course-staff",()=>({saveCourseStaff:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-purchases",()=>({CourseCustomerPurchases:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-bookings",()=>({CourseCustomerBookings:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-list",()=>({CourseCustomerList:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-health",()=>({CourseCustomerHealth:()=>null}));
import {CourseMemberWorkspace} from "@/app/(dashboard)/dashboard/courses/member-workspace";
let host:HTMLDivElement,root:Root;
const props={view:"customers" as const,templates:[],people:[{id:"person",name:"測試學員",phone:"0900000000",email:null,gender:null,birthday:"",height:null,lineName:null,serviceNote:null,address:null,notes:null,emergencyContactName:null,emergencyContactPhone:null}],plans:[],cards:[],canEdit:true,canCreate:true,canManageStaff:false,canAssign:true,canReadBookings:true,canReadTransactions:true,healthEnabled:true,customerRows:[],canReadCards:true,assignmentStaff:[],canAssignManager:false};
const click=async(text:string)=>{const b=[...host.querySelectorAll("button")].find(b=>b.textContent===text);expect(b,text).toBeTruthy();await act(async()=>b!.click());};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it("preserves the edit draft across tabs and rejects accidental closing",async()=>{
 await act(async()=>root.render(createElement(CourseMemberWorkspace,props)));
 await click("編輯顧客資料");
 const input=host.querySelector('input[name="name"]') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"尚未儲存姓名");input.dispatchEvent(new Event("input",{bubbles:true}));});
 await click("持有方案");await click("基本資料");
 expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("尚未儲存姓名");
 vi.spyOn(window,"confirm").mockReturnValue(false);await click("關閉");
 expect(window.confirm).toHaveBeenCalled();expect(host.querySelector('input[name="name"]')).not.toBeNull();expect(m.save).not.toHaveBeenCalled();
});
it("does not show unauthorized wallet, record, health, or edit controls",async()=>{
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,canEdit:false,canCreate:false,canAssign:false,canReadCards:false,canReadBookings:false,canReadTransactions:false,healthEnabled:false})));
 const buttons=[...host.querySelectorAll("button")].map(b=>b.textContent);
 for(const label of ["持有方案","購買與上課","健康追蹤","編輯顧客資料","儲存"])expect(buttons).not.toContain(label);
});
it("separates plan products and held plans into compact views",async()=>{
 const plans=[{id:"plan",name:"運動十點方案",points:10,price:1000,validDays:30,isActive:true,unit:"POINT",templateIds:[]}];
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,view:"plans",plans})));
 expect(host.textContent).toContain("方案商品");
 expect(host.textContent).toContain("單位價格");
 expect(host.textContent).not.toContain("搜尋方案／共卡成員");
 await click("顧客持有方案");
 expect(host.querySelector('input[placeholder="搜尋方案／共卡成員"]')).not.toBeNull();
 expect([...host.querySelectorAll("button")].map(button=>button.textContent)).toContain("指派方案");
 expect(host.textContent).not.toContain("單位價格");
});
