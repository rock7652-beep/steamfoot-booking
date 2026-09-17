export type CourseFinancialPurchase = {staffId:string|null;customerId:string;netAmount:number;refund:boolean;unit:string};
export type CourseManualCash = {staffId:string|null;type:string;amount:number;category:string|null};
export function summarizeCourseFinancialAnalysis(purchases:CourseFinancialPurchase[]|null,cash:CourseManualCash[]|null) {
  const staff=new Map<string,{id:string;purchaseIncome:number;refunds:number;manualIncome:number;manualExpense:number;orders:number;customers:Set<string>}>();
  const person=(id:string|null)=>{const key=id??"unassigned";if(!staff.has(key))staff.set(key,{id:key,purchaseIncome:0,refunds:0,manualIncome:0,manualExpense:0,orders:0,customers:new Set()});return staff.get(key)!;};
  const categories=new Map<string,{name:string;income:number;refunds:number;expense:number}>();
  const category=(name:string)=>{if(!categories.has(name))categories.set(name,{name,income:0,refunds:0,expense:0});return categories.get(name)!;};
  let purchaseIncome=0,refunds=0,manualIncome=0,manualExpense=0;
  for(const row of purchases??[]) {
    const p=person(row.staffId),c=category(row.unit==="SESSION"?"堂數方案":"點數方案");
    if(row.refund){const amount=Math.abs(row.netAmount);refunds+=amount;p.refunds+=amount;c.refunds+=amount;}
    else {purchaseIncome+=row.netAmount;p.purchaseIncome+=row.netAmount;p.orders++;p.customers.add(row.customerId);c.income+=row.netAmount;}
  }
  for(const row of cash??[]) {
    const p=person(row.staffId),c=category(`手動收支 · ${row.category?.trim()||"未分類"}`);
    if(row.type==="INCOME"){manualIncome+=row.amount;p.manualIncome+=row.amount;c.income+=row.amount;}
    else if(row.type==="EXPENSE"){manualExpense+=row.amount;p.manualExpense+=row.amount;c.expense+=row.amount;}
  }
  return {
    purchaseIncome:purchases===null?null:purchaseIncome,refunds:purchases===null?null:refunds,
    manualIncome:cash===null?null:manualIncome,manualExpense:cash===null?null:manualExpense,
    totalIncome:purchases===null||cash===null?null:purchaseIncome+manualIncome,
    net:purchases===null||cash===null?null:purchaseIncome+manualIncome-refunds-manualExpense,
    categories:[...categories.values()].map(c=>({...c,net:c.income-c.refunds-c.expense})),
    staff:[...staff.values()].map(p=>({...p,customers:p.customers.size,net:p.purchaseIncome-p.refunds+p.manualIncome-p.manualExpense})).sort((a,b)=>b.net-a.net||a.id.localeCompare(b.id)),
  };
}
