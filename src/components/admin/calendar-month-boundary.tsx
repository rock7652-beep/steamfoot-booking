"use client";

import type {ReactNode} from "react";

/** A spillover week is not a complete snapshot of the adjacent month. */
export function calendarMonthReady(enabled:boolean,date:string,snapshotMonth:string) {
  return !enabled || date.slice(0,7)===snapshotMonth;
}

export function CalendarMonthBoundary({ready,date,loading,error,onRetry,children}:{
  ready:boolean;date:string;loading:boolean;error:string;onRetry:()=>void;children:ReactNode;
}) {
  if(ready)return children;
  return <section aria-label="課表載入" aria-busy={loading} className="flex min-h-[28rem] flex-col items-center justify-center gap-3 rounded-xl border border-earth-200 bg-white p-6">
    <p role={error?"alert":"status"}>{error||`正在載入 ${date.slice(0,7).replace("-","/")} 課表…`}</p>
    {error&&<button type="button" disabled={loading} className="min-h-11 rounded-lg border border-earth-200 px-4 text-primary-800 disabled:opacity-50" onClick={onRetry}>{loading?"讀取中…":"重新讀取"}</button>}
  </section>;
}
