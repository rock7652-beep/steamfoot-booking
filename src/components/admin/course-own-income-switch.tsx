"use client";

import { useRef, useState, useTransition } from "react";
import { saveCourseOwnIncomeAccess } from "@/server/actions/course-own-income-access";

export function CourseOwnIncomeSwitch({storeId,staffId,initialEnabled,canEdit,blocked,storeEnabled,onSaved,onPendingChange}:{
  storeId:string;staffId:string;initialEnabled:boolean;canEdit:boolean;blocked:boolean;storeEnabled:boolean;
  onSaved:(data:{enabled:boolean;updatedAt:string})=>void;
  onPendingChange:(pending:boolean)=>void;
}) {
  const [enabled,setEnabled]=useState(initialEnabled);
  const [error,setError]=useState("");
  const [pending,start]=useTransition();
  const busy=useRef(false);
  function change() {
    if (!canEdit || blocked || busy.current) return;
    const previous=enabled;
    busy.current=true;onPendingChange(true);setError("");setEnabled(!previous);
    start(async()=>{
      try {
        const result=await saveCourseOwnIncomeAccess({storeId,staffId,previous,enabled:!previous});
        if (!result.success) {setEnabled(previous);setError(result.error);}
        else {setEnabled(result.data.enabled);onSaved(result.data);}
      } catch {setEnabled(previous);setError("儲存結果未確認，請重新開啟核對");}
      finally {busy.current=false;onPendingChange(false);}
    });
  }
  return <section aria-label="我的工作權限" className="mb-3 rounded-lg border border-earth-200 px-3 py-2">
    <h3 className="text-sm font-medium">我的工作權限</h3>
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm">
      <span>允許查看自己的薪酬</span>
      {canEdit?<button type="button" role="switch" aria-checked={enabled} aria-label="允許查看自己的薪酬" disabled={pending||blocked} onClick={change} className="min-h-11 min-w-16 rounded-lg border border-earth-200 px-3 text-primary-800 disabled:opacity-50">{pending?"儲存中…":enabled?"開啟":"關閉"}</button>:<span>{enabled?"開啟":"關閉"} · 僅老闆可修改</span>}
    </div>
    {blocked&&canEdit&&<p className="text-sm text-earth-600">請先儲存其他修改。</p>}
    {enabled&&!storeEnabled&&<p className="text-sm text-earth-600">門市尚未開放本人收入查詢。</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
