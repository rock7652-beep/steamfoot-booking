import {expect,it} from "vitest";
import {summarizeCourseFinancialAnalysis as summarize} from "@/lib/course-financial-analysis";
it("keeps purchase, refund, manual income and expense distinct and attributes actual customers",()=>{
 const f=summarize([{staffId:"owner",customerId:"A",netAmount:1000,refund:false,unit:"POINT"},{staffId:"owner",customerId:"A",netAmount:500,refund:false,unit:"SESSION"},{staffId:"owner",customerId:"A",netAmount:-200,refund:true,unit:"POINT"}],[{staffId:null,type:"INCOME",amount:300,category:"零售"},{staffId:"owner",type:"EXPENSE",amount:50,category:"材料"}]);
 expect(f).toMatchObject({purchaseIncome:1500,refunds:200,manualIncome:300,manualExpense:50,totalIncome:1800,net:1550});
 expect(f.staff.find(s=>s.id==="owner")).toMatchObject({orders:2,customers:1,net:1250});expect(f.staff.find(s=>s.id==="unassigned")).toMatchObject({manualIncome:300,net:300});
 expect(f.categories.find(c=>c.name==="點數方案")).toMatchObject({income:1000,refunds:200,net:800});
});
it("missing financial permission stays unknown rather than a real zero or partial total",()=>{
 expect(summarize(null,[])).toMatchObject({purchaseIncome:null,refunds:null,manualIncome:0,totalIncome:null,net:null});
 expect(summarize([],null)).toMatchObject({manualIncome:null,manualExpense:null,totalIncome:null,net:null});
 expect(summarize([],[])).toMatchObject({totalIncome:0,net:0});
});
