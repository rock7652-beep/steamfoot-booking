// @vitest-environment jsdom
import {createElement,act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/server/actions/course-monthly-settlement",()=>({confirmCourseMonthlySettlement:vi.fn(),saveCourseSettlementSettings:vi.fn(),payCourseProfit:vi.fn(),correctCourseProfit:vi.fn()}));
import {CourseMonthlyPeople,CourseMonthlyConfirm,CourseProfitCorrect} from "@/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-client";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("keeps server-rendered person rows paired when sorting and filtering",async()=>{
 const entries=[{id:"paid",name:"已付",pending:false,priority:3},{id:"due",name:"未付",pending:true,priority:2},{id:"issue",name:"待核對",pending:true,priority:0},{id:"over",name:"溢付",pending:true,priority:1}];
 await act(async()=>root.render(createElement(CourseMonthlyPeople,{entries},false,entries.map(e=>createElement("article",{key:e.id},e.id)))));
 const rows=()=>Array.from(host.querySelectorAll("article")).map(e=>e.textContent);
 expect(rows()).toEqual(["issue","over","due"]);
 await act(async()=>Array.from(host.querySelectorAll("button")).find(e=>e.textContent?.startsWith("全部"))!.click());
 expect(rows()).toEqual(["issue","over","due","paid"]);
 await act(async()=>Array.from(host.querySelectorAll("button")).find(e=>e.textContent?.startsWith("已結清"))!.click());
 expect(rows()).toEqual(["paid"]);
 expect(host.textContent).toContain("上方總額仍為整月金額");
});
it("explains an empty pending filter without hiding access to settled people",async()=>{
 await act(async()=>root.render(createElement(CourseMonthlyPeople,{entries:[{id:"paid",name:"已付",pending:false,priority:3}]},createElement("article",null,"paid"))));
 expect(host.textContent).toContain("本月沒有待處理人員");
 await act(async()=>Array.from(host.querySelectorAll("button")).find(e=>e.textContent?.startsWith("全部"))!.click());
 expect(host.querySelector("article")?.textContent).toBe("paid");
});
it("explains blocked confirmation without enabling submission",async()=>{
 await act(async()=>root.render(createElement(CourseMonthlyConfirm,{month:"2026-09",fingerprint:"x".repeat(64),revision:0,disabled:true,blockedReason:"還有 9 筆待核對，暫時無法確認月結。"})));
 expect(host.textContent).toContain("還有 9 筆待核對");
 expect(host.querySelector("button")!.disabled).toBe(true);
});
it("warns before correction and requires a reason",async()=>{
 await act(async()=>root.render(createElement(CourseProfitCorrect,{paymentId:"p"})));
 await act(async()=>host.querySelector("button")!.click());
 expect(host.textContent).toContain("同步沖回對應支出");
 expect(host.textContent).toContain("不代表已收回款項");
 expect(host.querySelector("button")!.disabled).toBe(true);
});
it("keeps unknown amounts, expanded labels and LINE prerequisite explicit",()=>{
 const monthly=readFileSync("src/app/(dashboard)/dashboard/service-fee-calculator/course-monthly.tsx","utf8");
 expect(monthly).toContain('person.issues>0&&label!=="已付"?"待核對"');
 expect(monthly).toContain("收合明細 －");
 expect(monthly).toContain("divide-earth-100");
 const reminder=readFileSync("src/app/(dashboard)/dashboard/courses/reminders/page.tsx","utf8");
 expect(reminder).toContain('lineHealth?.status==="NOT_CONFIGURED"');
 expect(reminder).toContain("請先聯絡總部管理者完成串接");
});
