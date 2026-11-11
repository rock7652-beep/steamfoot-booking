vi.mock("@/server/actions/music-student-makeups",()=>({loadMusicStudentMakeups:vi.fn().mockResolvedValue({success:true,data:null}),loadMusicMakeupScheduleOptions:vi.fn(),createMusicStudentMakeupSchedule:vi.fn()}));
vi.mock("@/lib/session",()=>({getCurrentUser:vi.fn(),requireSession:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-transaction-action",()=>({CustomerTransactionAction:()=>null}));
vi.mock("@/components/admin/store-member-connection-panel", () => ({ StoreMemberConnectionPanel: () => null }));
// @vitest-environment jsdom
vi.mock("@/server/actions/course-phone-view",()=>({loadCoursePhoneConnection:vi.fn().mockResolvedValue({success:true,data:{anchorCustomerId:"person",learnerCount:1,grantId:null,linked:false,canConfirm:false,pending:[]}}),confirmCoursePhoneLogin:vi.fn(),confirmCoursePhoneView:vi.fn(),removeCoursePhoneView:vi.fn()}));

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
const m=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn(),courseAssign:vi.fn(),sportsSave:vi.fn(),browse:vi.fn(),management:vi.fn(),adjust:vi.fn(),replace:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/courses",useRouter:()=>({refresh:m.refresh,replace:m.replace}),useSearchParams:()=>new URLSearchParams("customerId=person")}));
vi.mock("@/components/admin/right-sheet",()=>({RightSheet:({children,width,fitContent,maxHeight}:{children:unknown;width:number;fitContent:boolean;maxHeight?:number})=>createElement("aside",{"data-width":width,"data-max-height":maxHeight,"data-fit-content":String(fitContent)},children as never)}));
vi.mock("@/components/customer-attribution-form",()=>({CustomerAttributionForm:()=>null}));
vi.mock("@/server/actions/course-customer-attribution",()=>({saveCourseCustomerAttribution:vi.fn(),searchCourseReferrerCandidates:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({saveCourseCustomer:m.save,saveCoursePointPlan:vi.fn(),assignCoursePointCard:m.courseAssign,setCourseCardMembers:vi.fn(),loadCourseCustomerBookings:vi.fn().mockResolvedValue({success:true,data:[],hasMore:false}),loadMusicJoinOptions:vi.fn().mockResolvedValue({success:true,options:[]})}));
vi.mock("@/server/actions/course-purchase-intent",()=>({prepareCoursePurchaseIntent:vi.fn(),getCoursePurchaseIntent:vi.fn(),getPendingCoursePurchaseIntent:vi.fn(),cancelCoursePurchaseIntent:vi.fn(),acknowledgeCoursePurchaseIntent:vi.fn()}));
vi.mock("@/server/actions/course-staff",()=>({saveCourseStaff:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-purchases",()=>({CourseCustomerPurchases:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-bookings",()=>({CourseCustomerBookings:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-list",()=>({CourseCustomerList:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/customer-health",()=>({CourseCustomerHealth:()=>null}));
vi.mock("@/server/actions/sports-staging",()=>({saveSportsFee:m.sportsSave}));
vi.mock('@/lib/course-card-read-client',()=>({readNativeCourseCards:(...args:unknown[])=>m.browse(...args),readCourseCardProgress:vi.fn().mockResolvedValue({success:true,data:{total:10,completed:[]}})}));
vi.mock('@/app/(dashboard)/dashboard/courses/card-progress',()=>({CourseCardProgress:()=>createElement('div',{'data-grid':true},'方案日期格')}));
vi.mock('@/server/actions/course-card-management',()=>({saveCourseCardManagement:m.management}));
vi.mock('@/server/actions/course-session-adjustment',()=>({saveCourseSessionAdjustment:m.adjust}));
import {browseCourseCards} from '@/server/actions/course-browse';
import {CourseMemberWorkspace} from "@/app/(dashboard)/dashboard/courses/member-workspace";
import {CoursePurchaseIntentProvider} from "@/app/(dashboard)/dashboard/courses/purchase-recovery";
let host:HTMLDivElement,root:Root;
const props={view:"customers" as const,templates:[],people:[{id:"person",name:"測試學員",phone:"0900000000",email:null,gender:null,birthday:"",height:null,lineName:null,serviceNote:null,address:null,notes:null,emergencyContactName:null,emergencyContactPhone:null}],plans:[],cards:[],canEdit:true,canCreate:true,canManageStaff:false,canAssign:true,canReadBookings:true,canReadTransactions:true,healthEnabled:true,customerRows:[],canReadCards:true,assignmentStaff:[],canAssignManager:false};
const click=async(text:string)=>{const b=[...host.querySelectorAll("button")].find(b=>b.textContent===text||b.getAttribute("aria-label")===text);expect(b,text).toBeTruthy();await act(async()=>b!.click());};
beforeEach(()=>{vi.clearAllMocks();m.browse.mockResolvedValue({success:true,rows:[],hasMore:false});vi.mocked(browseCourseCards).mockResolvedValue({success:true,rows:[],hasMore:false,totals:[]});Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it("preserves the edit draft across tabs and closes without redundant confirmation",async()=>{
 await act(async()=>root.render(createElement(CourseMemberWorkspace,props)));
 await click("編輯顧客資料");
 const input=host.querySelector('input[name="name"]') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"尚未儲存姓名");input.dispatchEvent(new Event("input",{bubbles:true}));});
 await click("紀錄");await click("總覽");
 expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("尚未儲存姓名");
 vi.spyOn(window,"confirm").mockReturnValue(false);await click("關閉顧客資料");
 expect(window.confirm).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();expect(host.querySelector("aside")).toBeNull();
});
it("does not show unauthorized wallet, record, health, or edit controls",async()=>{
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,canEdit:false,canCreate:false,canAssign:false,canReadCards:false,canReadBookings:false,canReadTransactions:false,healthEnabled:false})));
 const buttons=[...host.querySelectorAll("button")].map(b=>b.getAttribute("aria-label")??b.textContent);
 for(const label of ["購買方案","新增方案","購課／續購","紀錄","健康追蹤","編輯顧客資料","儲存"])expect(buttons).not.toContain(label);
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
 for(const label of ["購買方案","紀錄","健康追蹤","總覽"]){
  await click(label);
  expect(host.querySelector("aside")).toBe(shell);
  expect(shell?.getAttribute("data-width")).toBe("1100");
  expect(shell?.getAttribute("data-fit-content")).toBe("false");
  expect(host.querySelector("h2")?.textContent).toBe("測試學員");
  expect(host.querySelector('nav[aria-label="顧客詳細資料分區"]')).not.toBeNull();
 }
 await click("編輯顧客資料");
 expect(host.querySelector('input[name="name"]')).not.toBeNull();
 await click("返回總覽");
 expect([...host.querySelectorAll("button")].map(b=>b.getAttribute("aria-label")??b.textContent)).toContain("編輯顧客資料");
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

it('closes a saved sports fee and immediately shows its confirmed name and purchase mode',async()=>{
 const plan={id:'fee',name:'原收費名稱',points:10,price:5800,storeCost:0,validDays:90,isActive:true,unit:'SESSION',templateIds:['template'],sportsMode:'LEGACY',chargeSettings:null,customerPurchasable:true,allowShared:false};
 const sportsData={storeId:'store',date:'2026-11-06',subjects:[],coaches:[],rooms:[],lessons:[],students:[],customers:[],fees:[{id:plan.id,subject:'subject',name:plan.name,unit:'堂數',amount:10,price:5800,days:90,cost:1,shared:false,templateId:'template',snapshot:JSON.stringify(plan)}]};
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,view:'plans',people:[],sportsNative:true,previewStoreId:'store',sportsData,plans:[plan]})));
 await act(async()=>host.querySelector<HTMLButtonElement>('[data-plan-name="原收費名稱"]')!.click());
 const input=host.querySelector<HTMLInputElement>('input[name="name"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'更新後收費名稱');input.dispatchEvent(new Event('input',{bubbles:true}));host.querySelector<HTMLInputElement>('input[name="purchaseMode"][value="backend"]')!.click();});
 m.sportsSave.mockResolvedValue({success:true,data:{...plan,name:'更新後收費名稱',customerPurchasable:false}});
 await act(async()=>host.querySelector<HTMLFormElement>('#course-member-form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.sportsSave).toHaveBeenCalledWith(expect.objectContaining({name:'更新後收費名稱',customerPurchasable:false}));
 expect(host.querySelector('aside')).toBeNull();
 expect(host.querySelector('[data-plan-name="原收費名稱"]')).toBeNull();
 const row=host.querySelector<HTMLButtonElement>('[data-plan-name="更新後收費名稱"]')!;
 expect(row.closest('tr')!.textContent).toContain('僅後台指派');
 await act(async()=>row.click());
 expect(host.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe('更新後收費名稱');
 expect(host.querySelector<HTMLInputElement>('input[name="purchaseMode"][value="backend"]')!.checked).toBe(true);
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


it("uses scheduling flags without fee-editor data when deciding whether staff can purchase",async()=>{
 const plans=[{id:"plan",name:"已關閉通用卡",points:10,price:100,validDays:90,isActive:true,unit:"POINT",templateIds:[],sportsMode:"OPEN"}];
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,view:"plans",sportsNative:true,schedulingModes:{selfBookingEnabled:false,assignedSchedulingEnabled:true},people:[],plans})));
 await click("顧客持有方案");
 expect([...host.querySelectorAll("button")].find(b=>b.textContent==="購買方案")!.disabled).toBe(true);
});
it('offers a service purchase slot without changing the original plan form for other modules',async()=>{
 const source={purchaseService:({customerId}:{customerId?:string})=>createElement('p',null,'單次服務顧客 '+customerId),browseCards:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),cashStatus:vi.fn().mockResolvedValue({success:true,status:'OPEN'}),choices:[],sessionUnitLabel:'次',basePath:'/dashboard/beauty',canManageMembers:true} as unknown as import('@/app/(dashboard)/dashboard/courses/member-source').CourseCustomerSource;
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,source,initialCustomerId:'person',initialAction:'assign'})));
 const select=host.querySelector<HTMLSelectElement>('[aria-label="消費類型"]')!;expect(select).toBeTruthy();expect(select.textContent).toContain('多次方案');expect(select.textContent).toContain('單次／體驗');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(select,'service');select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.textContent).toContain('單次服務顧客 person');expect(host.querySelector('form#course-member-form')).toBeNull();expect([...host.querySelectorAll('button')].some(b=>b.textContent==='確認結帳')).toBe(false);
});

it('beauty-source checkout discovers a previously committed purchase and requires explicit acknowledgement',async()=>{
 sessionStorage.clear();const key='11111111-1111-4111-8111-111111111111',done={status:'COMMITTED' as const,requestKey:key,purchaseId:'card-1'};
 const transport={prepare:vi.fn(),get:vi.fn().mockResolvedValue({success:true,data:done}),getPending:vi.fn().mockResolvedValue({success:true,data:done}),cancel:vi.fn(),acknowledge:vi.fn().mockResolvedValue({success:true,data:done})};
 const assign=vi.fn(),source={assign,browseCards:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),cashStatus:vi.fn().mockResolvedValue({success:true,status:'OPEN'}),choices:[],sessionUnitLabel:'次',basePath:'/dashboard/beauty'} as unknown as import('@/app/(dashboard)/dashboard/courses/member-source').CourseCustomerSource;
 await act(async()=>root.render(createElement(CoursePurchaseIntentProvider,{enabled:true,storeId:'beauty-test',family:'beauty-plan',transport},createElement(CourseMemberWorkspace,{...props,source,initialCustomerId:'person',initialAction:'assign'}))));
 expect(transport.getPending).toHaveBeenCalledWith('person');expect(host.textContent).toContain('這筆購買已完成');expect(transport.acknowledge).not.toHaveBeenCalled();expect(assign).not.toHaveBeenCalled();
 await click('確認完成並繼續購買');expect(transport.acknowledge).toHaveBeenCalledWith('person',key);expect(assign).not.toHaveBeenCalled();expect(host.textContent).not.toContain('這筆購買已完成');
});

it('beauty-source checkout blocks an unknown prior outcome and does not submit a purchase',async()=>{
 sessionStorage.clear();const transport={prepare:vi.fn(),get:vi.fn(),getPending:vi.fn().mockRejectedValue(new Error('offline')),cancel:vi.fn(),acknowledge:vi.fn()};
 const assign=vi.fn(),source={assign,browseCards:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),cashStatus:vi.fn().mockResolvedValue({success:true,status:'OPEN'}),choices:[],sessionUnitLabel:'次',basePath:'/dashboard/beauty'} as unknown as import('@/app/(dashboard)/dashboard/courses/member-source').CourseCustomerSource;
 await act(async()=>root.render(createElement(CoursePurchaseIntentProvider,{enabled:true,storeId:'beauty-test',family:'beauty-plan',transport},createElement(CourseMemberWorkspace,{...props,source,initialCustomerId:'person',initialAction:'assign'}))));
 expect(host.textContent).toContain('購買結果尚未確認');expect(host.textContent).toContain('請勿再次收款');expect(assign).not.toHaveBeenCalled();expect(transport.prepare).not.toHaveBeenCalled();
 const submit=host.querySelector<HTMLButtonElement>('button[form="course-member-form"]');expect(submit?.disabled).toBe(true);
});

it.each(['beauty','course'])('%s checkout submits once and requires acknowledgement before another purchase',async family=>{
 sessionStorage.clear();const key='11111111-1111-4111-8111-111111111111',prepared={status:'PREPARED' as const,requestKey:key,purchaseId:null},done={status:'COMMITTED' as const,requestKey:key,purchaseId:'purchase-1'};
 vi.spyOn(crypto,'randomUUID').mockReturnValue(key);const transport={prepare:vi.fn().mockResolvedValue({success:true,data:prepared}),get:vi.fn().mockResolvedValue({success:true,data:done}),getPending:vi.fn().mockResolvedValue({success:true,data:null}),cancel:vi.fn(),acknowledge:vi.fn().mockResolvedValue({success:true,data:done})};
 const assign=vi.fn().mockResolvedValue({success:true}),purchaseCompleted=vi.fn();m.courseAssign.mockResolvedValue({success:true});
 const source=family==='beauty'?{assign,purchaseCompleted,browseCards:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),cashStatus:vi.fn().mockResolvedValue({success:true,status:'OPEN'}),choices:[],sessionUnitLabel:'次',basePath:'/dashboard/beauty'} as unknown as import('@/app/(dashboard)/dashboard/courses/member-source').CourseCustomerSource:undefined;
 const plan={id:'plan',name:'測試方案',points:10,price:1000,validDays:90,isActive:true,unit:'POINT',templateIds:[]};
 await act(async()=>root.render(createElement(CoursePurchaseIntentProvider,{enabled:true,storeId:'test-store',family,transport},createElement(CourseMemberWorkspace,{...props,source,plans:[plan],initialCustomerId:'person',initialAction:'assign'}))));
 const method=host.querySelector<HTMLSelectElement>('select[name="paymentMethod"]')!;expect(method).toBeTruthy();await act(async()=>{method.value='CARD';method.dispatchEvent(new Event('change',{bubbles:true}));});
 const form=host.querySelector<HTMLFormElement>('#course-member-form')!;expect(form).toBeTruthy();await act(async()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(transport.prepare).toHaveBeenCalledOnce();expect((family==='beauty'?assign:m.courseAssign)).toHaveBeenCalledOnce();expect(host.textContent).toContain('這筆購買已完成');expect(transport.acknowledge).not.toHaveBeenCalled();expect(purchaseCompleted).not.toHaveBeenCalled();
 await click('確認完成並繼續購買');expect(transport.acknowledge).toHaveBeenCalledWith('person',key);expect(host.textContent).not.toContain('這筆購買已完成');if(family==='beauty')expect(purchaseCompleted).toHaveBeenCalledOnce();else expect(host.querySelector('#course-member-form')).not.toBeNull();
});

it('does not enable beauty recovery when the server rollout flag is off',async()=>{
 sessionStorage.clear();const transport={prepare:vi.fn(),get:vi.fn(),getPending:vi.fn(),cancel:vi.fn(),acknowledge:vi.fn()};
 const source={assign:vi.fn(),browseCards:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),cashStatus:vi.fn().mockResolvedValue({success:true,status:'OPEN'}),choices:[],sessionUnitLabel:'次',basePath:'/dashboard/beauty'} as unknown as import('@/app/(dashboard)/dashboard/courses/member-source').CourseCustomerSource;
 await act(async()=>root.render(createElement(CoursePurchaseIntentProvider,{enabled:false,storeId:'beauty-test',family:'beauty-plan',transport},createElement(CourseMemberWorkspace,{...props,source,initialCustomerId:'person',initialAction:'assign'}))));
 expect(transport.getPending).not.toHaveBeenCalled();expect(host.textContent).not.toContain('購買結果尚未確認');
});

it('beauty-source late status for a previous customer cannot appear in the next customer window',async()=>{
 sessionStorage.clear();let release!:(v:{success:true;data:{status:'COMMITTED';requestKey:string;purchaseId:string}})=>void;
 const prior=new Promise<{success:true;data:{status:'COMMITTED';requestKey:string;purchaseId:string}}>(resolve=>{release=resolve});
 const transport={prepare:vi.fn(),get:vi.fn(),getPending:vi.fn((id:string)=>id==='person'?prior:Promise.resolve({success:true as const,data:null})),cancel:vi.fn(),acknowledge:vi.fn()};
 const source={assign:vi.fn(),browseCards:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),cashStatus:vi.fn().mockResolvedValue({success:true,status:'OPEN'}),choices:[],sessionUnitLabel:'次',basePath:'/dashboard/beauty'} as unknown as import('@/app/(dashboard)/dashboard/courses/member-source').CourseCustomerSource;
 const people=[...props.people,{...props.people[0],id:'other',name:'另一位顧客'}];
 const view=(id:string)=>createElement(CoursePurchaseIntentProvider,{enabled:true,storeId:'beauty-test',family:'beauty-plan',transport},createElement(CourseMemberWorkspace,{...props,key:id,people,source,initialCustomerId:id,initialAction:'assign'}));
 await act(async()=>root.render(view('person')));await act(async()=>root.render(view('other')));
 await act(async()=>release({success:true,data:{status:'COMMITTED',requestKey:'11111111-1111-4111-8111-111111111111',purchaseId:'old-card'}}));
 expect(transport.getPending).toHaveBeenCalledWith('other');expect(host.textContent).not.toContain('這筆購買已完成');expect(host.textContent).toContain('另一位顧客');expect(transport.acknowledge).not.toHaveBeenCalled();
});

it('opens the module staff entry instead of the generic course staff action',async()=>{
 const open=vi.fn(),source={staffAction:{label:'加入為技師',available:(id:string)=>id==='person',open},browseCards:vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}),bookings:vi.fn().mockResolvedValue({success:true,data:[],hasMore:false}),choices:[],sessionUnitLabel:'次',basePath:'/dashboard/beauty'} as unknown as import('@/app/(dashboard)/dashboard/courses/member-source').CourseCustomerSource;
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,source,canManageStaff:false})));
 await click('加入為技師');expect(open).toHaveBeenCalledWith('person');expect(host.textContent).not.toContain('加入為教練');
});

it.each(['調整期限','註銷方案'])('opens %s below the existing grid without changing the customer panel or route',async action=>{
 const card={id:'inline-card-'+action,name:'鋼琴十堂',unit:'SESSION',remaining:10,held:0,available:10,expiresAt:'2027-12-31T15:59:59.999Z',closed:false,expired:false,members:[{id:'person',name:'測試學員'}],entries:[],templateIds:[],sessionAdjustments:[]};
 m.browse.mockResolvedValue({success:true,rows:[card],hasMore:false});vi.mocked(browseCourseCards).mockResolvedValue({success:true,rows:[card],hasMore:false} as never);
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,previewStoreId:'store',canManageCards:true})));
 m.replace.mockClear();const url=window.location.href,panels=host.querySelectorAll('aside').length;
 const more=[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='鋼琴十堂 更多操作')!;expect(more).toBeTruthy();await act(async()=>more.click());
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent===action)!.click());
 expect(host.querySelector('[aria-label="同頁方案操作"]')).not.toBeNull();expect(host.querySelector('[data-grid]')).not.toBeNull();expect(host.querySelectorAll('aside')).toHaveLength(panels);
 if(action==='調整期限')expect(host.querySelector('[aria-label="新到期日"]')).not.toBeNull();else expect(host.textContent).toContain('收回剩餘 10 堂');
 expect(m.replace).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();expect(window.location.href).toBe(url);expect(m.management).not.toHaveBeenCalled();expect(m.adjust).not.toHaveBeenCalled();
 await click('取消');expect(host.querySelector('[aria-label="同頁方案操作"]')).toBeNull();expect(host.querySelector('[data-grid]')).not.toBeNull();
});

it('rechecks the current card status before exposing an inline financial form',async()=>{
 const card={id:'now-closed-card',name:'已更新方案',unit:'SESSION',remaining:10,held:0,available:10,expiresAt:null,closed:false,expired:false,members:[{id:'person',name:'測試學員'}],entries:[],templateIds:[]};
 m.browse.mockResolvedValue({success:true,rows:[card],hasMore:false});vi.mocked(browseCourseCards).mockResolvedValue({success:true,rows:[{...card,closed:true}],hasMore:false,totals:[]} as never);
 await act(async()=>root.render(createElement(CourseMemberWorkspace,{...props,previewStoreId:'store',canManageCards:true})));
 await act(async()=>[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='已更新方案 更多操作')!.click());
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='調整期限')!.click());
 expect(host.textContent).toContain('方案狀態已變更');expect(host.querySelector('[aria-label="新到期日"]')).toBeNull();expect(m.management).not.toHaveBeenCalled();expect(m.adjust).not.toHaveBeenCalled();
});
