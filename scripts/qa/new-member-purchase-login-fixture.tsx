import React from "react";
import {createRoot} from "react-dom/client";
import {AssignPlanForm} from "@/app/(dashboard)/dashboard/customers/[id]/assign-plan-form";
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-3xl p-4"><h1 className="mb-3 text-base font-semibold">新客開卡 · 合成驗收</h1><AssignPlanForm customerId="synthetic-guest" plans={[{id:"plan",name:"蒸足五堂方案",category:"PACKAGE",price:3000,sessionCount:5,validityDays:90}]} /></main>);
