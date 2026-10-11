"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { saveCourseOwnIncomeAccess } from "@/server/actions/course-own-income-access";
import { NotificationSwitch } from "@/components/admin/notification-switch";

export function CourseOwnIncomeSwitch({storeId,staffId,initialEnabled,canEdit,blocked,storeEnabled,music=false,lineBound=true,onSaved,onPendingChange}:{
  storeId:string;staffId:string;initialEnabled:boolean;canEdit:boolean;blocked:boolean;storeEnabled:boolean;
  music?:boolean;lineBound?:boolean;
  onSaved:(data:{enabled:boolean;updatedAt:string})=>void;
  onPendingChange:(pending:boolean)=>void;
}) {
  const [enabled,setEnabled]=useState(initialEnabled);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  const [pending,setPending]=useState(false);
  const busy=useRef(false);
  const feedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(feedbackTimer.current)clearTimeout(feedbackTimer.current);},[]);
  function change() {
    if (!canEdit || blocked || busy.current) return;
    const previous=enabled;
    if(feedbackTimer.current)clearTimeout(feedbackTimer.current);
    busy.current=true;
    // Commit the visible switch before starting the server action/revalidation.
    flushSync(()=>{setPending(true);setError("");setSaved(false);setEnabled(!previous);onPendingChange(true);});
    void (async()=>{
      try {
        const result=await saveCourseOwnIncomeAccess({storeId,staffId,previous,enabled:!previous});
        if (!result.success) {setEnabled(previous);setError(result.error);}
        else {setEnabled(result.data.enabled);onSaved(result.data);setSaved(true);feedbackTimer.current=setTimeout(()=>setSaved(false),2500);}
      } catch {setEnabled(previous);setError("儲存結果未確認，請重新開啟核對");}
      finally {busy.current=false;setPending(false);onPendingChange(false);}
    })();
  }
  const title=music?"教師權限":"教練權限";
  return <section aria-label={title} className="mb-3 rounded-lg border border-earth-200 bg-earth-50 px-3 py-1">
    <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <h3 className="font-medium text-primary-900">{title}</h3>
      <label className="flex min-h-11 min-w-0 flex-wrap items-center gap-3">
        <span>查看自己的薪酬</span>
        <span className="flex min-h-11 items-center gap-2">
          <NotificationSwitch checked={enabled} aria-checked={enabled} aria-label="查看自己的薪酬" disabled={!canEdit||pending||blocked} style={pending?{opacity:1}:undefined} onChange={change}/>
          <span className="min-w-7 text-earth-600">{enabled?"開啟":"關閉"}</span>
        </span>
      </label>
      {canEdit?<span role="status" className="min-w-20 text-primary-800">{pending?"儲存中…":saved?"已儲存 ✓":""}</span>:<span className="text-earth-600">僅老闆可修改</span>}
      {enabled&&!lineBound&&<span className="text-earth-600">待綁定 LINE</span>}
    </div>
    {blocked&&canEdit&&<p className="text-sm text-earth-600">請先儲存其他修改。</p>}
    {enabled&&!storeEnabled&&<p className="text-sm text-earth-600">門市尚未開放本人收入查詢。</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
