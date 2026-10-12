"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { saveCourseOwnIncomeAccess } from "@/lib/course-work-permission-client";
import { NotificationSwitch } from "@/components/admin/notification-switch";

export function CourseOwnIncomeSwitch({storeId,staffId,initialEnabled,canEdit,blocked,storeEnabled,lineBound=true,permission="teacher.income.read.self",label="查看自己的薪酬",blockedMessage="請先儲存其他修改。",onSaved,onPendingChange}:{
  storeId:string;staffId:string;initialEnabled:boolean;canEdit:boolean;blocked:boolean;storeEnabled:boolean;
  music?:boolean;lineBound?:boolean;
  permission?:"teacher.income.read.self"|"teacher.booking.leave"|"teacher.booking.reschedule"|"teacher.session.leave"|"teacher.session.reschedule";label?:string;blockedMessage?:string;
  onSaved:(data:{enabled:boolean;updatedAt:string})=>void;
  onPendingChange:(pending:boolean)=>void;
}) {
  const [enabled,setEnabled]=useState(initialEnabled);
  const [error,setError]=useState("");
  const [uncertain,setUncertain]=useState(false);
  const [saved,setSaved]=useState(false);
  const [pending,setPending]=useState(false);
  const busy=useRef(false);
  const feedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(feedbackTimer.current)clearTimeout(feedbackTimer.current);},[]);
  function change() {
    if (!canEdit || blocked || busy.current || uncertain) return;
    const previous=enabled;
    if(feedbackTimer.current)clearTimeout(feedbackTimer.current);
    busy.current=true;
    // Commit the visible switch before starting the server action/revalidation.
    flushSync(()=>{setPending(true);setError("");setSaved(false);setEnabled(!previous);onPendingChange(true);});
    void (async()=>{
      try {
        const result=await saveCourseOwnIncomeAccess({storeId,staffId,previous,enabled:!previous,permission});
        if (!result.success) {setEnabled(previous);setError(result.error);setUncertain(result.uncertain===true);}
        else {setEnabled(result.data.enabled);onSaved(result.data);setSaved(true);feedbackTimer.current=setTimeout(()=>setSaved(false),2500);}
      } catch {setUncertain(true);setEnabled(previous);setError("儲存結果未確認，請重新整理核對");}
      finally {busy.current=false;setPending(false);onPendingChange(false);}
    })();
  }
  const title="我的工作權限";
  return <section aria-label={title} className="rounded-lg border border-earth-200 bg-earth-50 px-3 py-1">
    <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm">

      <label className="flex min-h-11 min-w-0 flex-wrap items-center gap-3">
        <span>{label}</span>
        <span className="flex min-h-11 items-center gap-2">
          <NotificationSwitch checked={enabled} aria-checked={enabled} aria-label={label} disabled={!canEdit||pending||blocked||uncertain} style={pending?{opacity:1}:undefined} onChange={change}/>
          <span className="min-w-7 text-earth-600">{uncertain?"待核對":enabled?"開啟":"關閉"}</span>
        </span>
      </label>
      {canEdit?(pending||saved)&&<span role="status" className="text-primary-800">{pending?"儲存中…":"已儲存 ✓"}</span>:<span className="text-earth-600">僅老闆可修改</span>}
      {enabled&&!lineBound&&<span className="text-earth-600">待綁定 LINE</span>}
    </div>
    {blocked&&canEdit&&!pending&&<p className="text-sm text-earth-600">{blockedMessage}</p>}
    {permission==="teacher.income.read.self"&&enabled&&!storeEnabled&&<p className="text-sm text-earth-600">門市尚未開放本人收入查詢。</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{uncertain&&<button type="button" className="min-h-11 text-sm text-primary-800 underline" onClick={()=>window.location.reload()}>重新整理核對</button>}
  </section>;
}
