vi.mock("@/server/actions/music-student-makeups",()=>({loadMusicStudentMakeups:vi.fn().mockResolvedValue({success:true,data:null})}));
vi.mock("@/lib/session",()=>({getCurrentUser:vi.fn(),requireSession:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-transaction-action",()=>({CustomerTransactionAction:()=>null}));
vi.mock("@/components/admin/store-member-connection-panel", () => ({ StoreMemberConnectionPanel: () => null }));
// @vitest-environment jsdom

import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-panel-advanced",()=>({CustomerPanelAdvanced:()=>null}));
vi.mock("@/server/actions/music-student-workspace",()=>({loadMusicStudentWorkspace:vi.fn().mockResolvedValue({success:true,data:{balance:null,next:null,tuition:null,opening:null,canReadBookings:false}})}));
vi.mock("@/server/actions/course-display-order",()=>({saveCourseDisplayOrder:vi.fn()}));
vi.mock("@/server/actions/course-batch",()=>({applyCourseBatchStatus:vi.fn(),courseStatusImpact:vi.fn()}));
vi.mock("@/components/customer-labels",()=>({CustomerLabels:()=>null}));
vi.mock("@/server/actions/course-customer-note", () => ({ saveCourseCustomerNote: vi.fn() }));
vi.mock("@/server/actions/course-card-reservations",()=>({loadCourseCardReservations:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false,scoped:false})}));
vi.mock("@/server/actions/course-browse",()=>({browseCourseCards:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),searchCourseCustomers:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),loadCourseCustomerSearchIndex:vi.fn().mockResolvedValue({success:true,rows:[],complete:true})}));
vi.mock("@/components/admin/course-batch-selection",()=>({CourseBatchBar:()=>null}));
vi.mock("@/server/actions/course-checkout-status",()=>({getCourseCheckoutCashStatus:vi.fn().mockResolvedValue({success:true,status:"OPEN"})}));
const m=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/courses",useRouter:()=>({refresh:m.refresh,replace:vi.fn()}),useSearchParams:()=>new URLSearchParams("customerId=person")}));
vi.mock("@/components/admin/right-sheet",()=>({RightSheet:({children,width,fitContent,maxHeight}:{children:unknown;width:number;fitContent:boolean;maxHeight?:number})=>createElement("aside",{"data-width":width,"data-max-height":maxHeight,"data-fit-content":String(fitContent)},children as never)}));
vi.mock("@/components/customer-attribution-form",()=>({CustomerAttributionForm:()=>null}));
vi.mock("@/server/actions/course-customer-attribution",()=>({saveCourseCustomerAttribution:vi.fn(),searchCourseReferrerCandidates:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({saveCourseCustomer:m.save,saveCoursePointPlan:vi.fn(),assignCoursePointCard:vi.fn(),setCourseCardMembers:vi.fn(),loadMusicJoinOptions:vi.fn().mockResolvedValue({success:true,options:[]})}));
vi.mock("@/server/actions/course-staff",()=>({saveCourseStaff:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-purchases",()=>({CourseCustomerPurchases:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-bookings",()=>({CourseCustomerBookings:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-list",()=>({CourseCustomerList:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-health",()=>({CourseCustomerHealth:()=>null}));
vi.mock("@/server/actions/sports-staging",()=>({saveSportsFee:vi.fn()}));
import {CourseMemberWorkspace} from "@/app/(dashboard)/dashboard/courses/member-workspace";
let host:HTMLDivElement,root:Root;
const props={view:"customers" as const,templates:[],people:[{id:"person",name:"測試學員",phone:"0900000000",email:null,gender:null,birthday:"",height:null,lineName:null,serviceNote:null,address:null,notes:null,emergencyContactName:null,emergencyContactPhone:null}],plans:[],cards:[],canEdit:true,canCreate:true,canManageStaff:false,canAssign:true,canReadBookings:true,canReadTransactions:true,healthEnabled:true,customerRows:[],canReadCards:true,assignmentStaff:[],canAssignManager:false};
const click=async(text:string)=>{const b=[...host.querySelectorAll("button")].find(b=>b.textContent===text);expect(b,text).toBeTruthy();await act(async()=>b!.click());};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it("preserves the edit draft across tabs and closes without redundant confirmation",async()=>{
 await act(async()=>root.render(createElement(CourseMemberWorkspace,props)));
 await click("編輯顧客資料");
 const input=host.querySelector('input[name="name"]') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"尚未儲存姓名");input.dispatchEvent(new Event("input",{bubbles:true}));});
 await click("紀錄");await click("顧客概況");
 expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("尚未儲存姓名");
 vi.spyOn(window,"confirm").mockReturnValue(false);await click("關閉");
 expect(window.confirm).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();expect(host.querySelector("aside")).toBeNull();
});
it("does not show unauthorized wallet, record, health, or edit controls",async()=>{
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,canEdit:false,canCreate:false,canAssign:false,canReadCards:false,canReadBookings:false,canReadTransactions:false,healthEnabled:false})));
 const buttons=[...host.querySelectorAll("button")].map(b=>b.textContent);
 for(const label of ["購買方案","紀錄","健康追蹤","編輯顧客資料","儲存"])expect(buttons).not.toContain(label);
});
it("separates plan products and held plans into compact views",async()=>{
 const plans=[{id:"plan",name:"運動十點方案",points:10,price:1000,validDays:30,isActive:true,unit:"POINT",templateIds:[]}];
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,view:"plans",plans})));
 expect(host.textContent).toContain("方案商品");
 expect(host.textContent).toContain("NT$ 100／點");
 expect(host.textContent).not.toContain("搜尋方案／共卡成員");
 await click("顧客持有方案");
 expect(host.querySelector('input[placeholder="搜尋方案／共卡成員"]')).not.toBeNull();
 expect([...host.querySelectorAll("button")].map(button=>button.textContent)).toContain("購買方案");
 expect(host.textContent).not.toContain("單位價格");
});

it.each([false,true])("opens plan checkout without preloaded customers (music=%s)",async music=>{
 const plans=[{id:"plan",name:"驗收方案",points:10,price:100,validDays:90,isActive:true,unit:music?"SESSION":"POINT",templateIds:[]}];
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,view:"plans",sportsNative:!music,music,people:[],plans})));
 await click("顧客持有方案");
 const purchase=[...host.querySelectorAll("button")].find(b=>b.textContent===(music?"購課／續購":"購買方案"))!;
 expect(purchase.disabled).toBe(false);
 await click(music?"購課／續購":"購買方案");
 expect(host.querySelector('input[aria-label="搜尋顧客姓名、電話或 LINE 名稱"]')).not.toBeNull();
 const form=host.querySelector<HTMLFormElement>('#course-member-form')!;
 expect(form).not.toBeNull();
 expect(form.checkValidity()).toBe(false);
});

it("keeps checkout disabled when there are no active plans",async()=>{
 const plans=[{id:"plan",name:"下架方案",points:10,price:100,validDays:90,isActive:false,unit:"POINT",templateIds:[]}];
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,view:"plans",sportsNative:true,people:[],plans})));
 await click("顧客持有方案");
 expect([...host.querySelectorAll("button")].find(b=>b.textContent==="購買方案")!.disabled).toBe(true);
});

it("does not expose plan checkout without assignment permission",async()=>{
 const plans=[{id:"plan",name:"驗收方案",points:10,price:100,validDays:90,isActive:true,unit:"POINT",templateIds:[]}];
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,view:"plans",people:[],plans,canAssign:false})));
 await click("顧客持有方案");
 expect([...host.querySelectorAll("button")].some(b=>b.textContent==="購買方案")).toBe(false);
});

it("keeps the customer shell and navigation stable across internal pages",async()=>{
 await act(async()=>root.render(createElement(CourseMemberWorkspace,props)));
 const shell=host.querySelector("aside");
 expect(shell?.getAttribute("data-width")).toBe("1100");
 expect(shell?.getAttribute("data-fit-content")).toBe("false");
 expect(shell?.getAttribute("data-max-height")).toBe("900");
 for(const label of ["購買方案","紀錄","健康追蹤","顧客概況"]){
  await click(label);
  expect(host.querySelector("aside")).toBe(shell);
  expect(shell?.getAttribute("data-width")).toBe("1100");
  expect(shell?.getAttribute("data-fit-content")).toBe("false");
  expect(host.querySelector("h2")?.textContent).toBe("測試學員");
  expect(host.querySelector('nav[aria-label="顧客詳細資料分區"]')).not.toBeNull();
 }
 await click("編輯顧客資料");
 expect(host.querySelector('input[name="name"]')).not.toBeNull();
 await click("返回基本資料");
 expect([...host.querySelectorAll("button")].map(b=>b.textContent)).toContain("編輯顧客資料");
 expect(host.querySelector("aside")).toBe(shell);
});

it("combines purchase and shared-card filters immediately without changing purchase settings", async () => {
 const base={points:10,price:1000,validDays:90,isActive:true,unit:"POINT" as const,templateIds:[]};
 const plans=[{...base,id:"public",name:"公開共卡",customerPurchasable:true,allowShared:true},{...base,id:"internal",name:"後台個人",customerPurchasable:false,allowShared:false},{...base,id:"legacy",name:"舊方案",allowShared:false}];
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,view:"plans",plans})));
 const names=()=>[...host.querySelectorAll("tbody tr td:first-child button[data-plan-name]")].map(b=>b.getAttribute("aria-label"));
 const filter=async(label:string,value:string)=>{const el=host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;await act(async()=>{el.value=value;el.dispatchEvent(new Event("change",{bubbles:true}));});};
 await filter("購買方式篩選","backend");expect(names()).toEqual(["後台個人"]);
 await filter("共卡篩選","allowed");expect(names()).toEqual([]);
 await filter("購買方式篩選","customer");expect(names()).toEqual(["公開共卡"]);
 await filter("共卡篩選","disabled");expect(names()).toEqual(["舊方案"]);
 expect(plans[0]).toMatchObject({customerPurchasable:true});
});

it("keeps exactly one music summary when entering and leaving checkout repeatedly",async()=>{
 const errors=vi.spyOn(console,"error");
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,music:true})));
 for(let i=0;i<3;i++){
  await click("課程與學費");
  const add=[...host.querySelectorAll("aside button")].find(button=>button.textContent==="購課／續購");
  await act(async()=>{(add as HTMLButtonElement).click();});
  await click("‹ 返回 測試學員 詳情");
  expect(host.querySelectorAll('[aria-label="課程與學費"]').length).toBe(1);
 }
 expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key|Encountered two children/);
});
