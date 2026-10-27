import type { ReactNode } from "react";
const money=(value:number)=>`NT$ ${value.toLocaleString()}`;
/** One presentation for all industries; callers retain their accounting rules. */
export function OperationsReceiptSummary({gross,refunds,net,pendingCount,children}:{gross:number;refunds:number;net:number;pendingCount?:number;children?:ReactNode}) {
  return <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 border-y border-earth-200 py-3 text-sm" aria-label="營運摘要">
    <span>實收 <strong>{money(gross)}</strong></span><span>退款 <strong>{money(refunds)}</strong></span><span>淨收款 <strong>{money(net)}</strong></span>
    {pendingCount!==undefined&&<span>待核帳 <strong>{pendingCount} 筆</strong></span>}
    {children&&<details className="ml-auto"><summary className="min-h-11 cursor-pointer py-3">統計說明</summary><div className="max-w-xl space-y-1 py-2 text-earth-600">{children}</div></details>}
  </div>;
}
