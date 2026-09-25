// @vitest-environment jsdom
import {createElement,act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/server/actions/course-monthly-settlement",()=>({confirmCourseMonthlySettlement:vi.fn(),saveCourseSettlementSettings:vi.fn(),payCourseProfit:vi.fn(),correctCourseProfit:vi.fn()}));
import {CourseMonthlyReport,CourseMonthlyPeople,CourseMonthlyConfirm,CourseProfitCorrect} from "@/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-client";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("shows every person initially and keeps rows paired with names",async()=>{
 const entries=[{id:"a",name:"甲",pending:false,priority:1},{id:"b",name:"乙",pending:true,priority:0}];
 await act(async()=>root.render(createElement(CourseMonthlyPeople,{entries},false,entries.map(e=>createElement("article",{key:e.id},e.id)))));
 expect(Array.from(host.querySelectorAll("article")).map(e=>e.textContent)).toEqual(["b","a"]);
 expect(host.querySelector('input[aria-label="搜尋人員"]')).not.toBeNull();
 expect(host.textContent).not.toContain("已結清");
});
it("keeps actions beside search without changing person row pairing",async()=>{
 const entries=[{id:"a",name:"甲",pending:false,priority:1},{id:"b",name:"乙",pending:true,priority:0}];
 await act(async()=>root.render(createElement(CourseMonthlyPeople,{entries,actions:createElement("button",null,"設定")},entries.map(e=>createElement("article",{key:e.id},e.id)))));
 const toolbar=host.querySelector('[aria-label="月結工具列"]');
 expect(toolbar?.querySelector('input[aria-label="搜尋人員"]')).not.toBeNull();
 expect(toolbar?.querySelector("button")?.textContent).toBe("設定");
 expect(Array.from(host.querySelectorAll("article")).map(e=>e.textContent)).toEqual(["b","a"]);
});
it("does not hide a person because payment is already settled",async()=>{
 await act(async()=>root.render(createElement(CourseMonthlyPeople,{entries:[{id:"paid",name:"已付",pending:false,priority:1}]},createElement("article",null,"paid"))));
 expect(host.querySelector("article")?.textContent).toBe("paid");
 expect(host.querySelector("input")).toBeNull();
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
 const client=readFileSync("src/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-client.tsx","utf8");
 expect(client).toContain('person.issues>0||person.lines.some(l=>l.amount===null)?"待核對"');
 expect(monthly).not.toContain('CourseProfitPay');
 expect(monthly).toContain('歷史付款紀錄');
 expect(client).toContain("收合 －");
 expect(client).toContain("divide-earth-100");
 const reminder=readFileSync("src/app/(dashboard)/dashboard/courses/reminders/page.tsx","utf8");
 expect(reminder).toContain('lineHealth?.status==="NOT_CONFIGURED"');
 expect(reminder).toContain("請先聯絡總部管理者完成串接");
});

it("switches income totals, people and details without changing confirmation or writing settings",async()=>{
 const base={date:"2026-08-01T00:00:00Z",paid:0,issue:null,payments:[]};
 const lines=[{...base,kind:"PROFIT" as const,id:"p",staffId:"a",name:"店長甲",label:"方案利潤",amount:500},{...base,kind:"FEE" as const,id:"f",staffId:"b",name:"教練乙",label:"團課費用",amount:600},{...base,kind:"FEE" as const,id:"u",staffId:"c",name:"待核對教練",label:"缺少費用",amount:null}];
 await act(async()=>root.render(createElement(CourseMonthlyReport,{lines,confirm:createElement("button",{disabled:true},"確認月結")})));
 const click=async(label:string)=>act(async()=>Array.from(host.querySelectorAll('[aria-label="收入類別"] button')).find(b=>b.textContent===label)!.dispatchEvent(new MouseEvent("click",{bubbles:true})));
 await click("店長利潤");
 expect(host.textContent).toContain("利潤合計");expect(host.textContent).toContain("NT$ 500");
 expect(host.querySelectorAll("details")).toHaveLength(1);expect(host.textContent).not.toContain("教練乙");expect(host.textContent).not.toContain("缺少費用");
 expect(Array.from(host.querySelectorAll("button")).find(b=>b.textContent==="確認月結")!.disabled).toBe(true);
 await click("教練授課費");
 expect(host.textContent).toContain("授課費合計");expect(host.textContent).toContain("待核對");expect(host.querySelectorAll("details")).toHaveLength(2);expect(host.textContent).not.toContain("方案利潤");
 await click("全部");expect(host.querySelectorAll("details")).toHaveLength(3);
 const actions=await import("@/server/actions/course-monthly-settlement");
 expect(actions.saveCourseSettlementSettings).not.toHaveBeenCalled();expect(actions.confirmCourseMonthlySettlement).not.toHaveBeenCalled();
});
