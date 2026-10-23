"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { saveCourseOwnIncomeAccess } from "@/lib/course-work-permission-client";
import { NotificationSwitch } from "@/components/admin/notification-switch";

export type WorkPermissionWriter=(input:{storeId:string;staffId:string;previous:boolean;enabled:boolean;permission:string})=>Promise<{success:true;data:{enabled:boolean;updatedAt:string;revision?:number}}|{success:false;error:string;uncertain?:boolean}>;
export type CourseWorkPermissionFeedback={label:string;status:"pending"|"saved"|"error"|"uncertain";message?:string};

export function CourseOwnIncomeSwitch({save,storeId,staffId,initialEnabled,canEdit,blocked,permission="teacher.income.read.self",label="查看自己的薪酬",onFeedback,onSaved,onPendingChange}:{
  save?:WorkPermissionWriter;storeId:string;staffId:string;initialEnabled:boolean;canEdit:boolean;blocked:boolean;storeEnabled:boolean;
  music?:boolean;lineBound?:boolean;
  permission?:string;label?:string;
  onFeedback:(feedback:CourseWorkPermissionFeedback)=>void;
  onSaved:(data:{enabled:boolean;updatedAt:string;revision?:number})=>void;
  onPendingChange:(pending:boolean)=>void;
}) {
  const [enabled,setEnabled]=useState(initialEnabled);
  const [uncertain,setUncertain]=useState(false);
  const [pending,setPending]=useState(false);
  const busy=useRef(false);
  function change() {
    if (!canEdit || blocked || busy.current || uncertain) return;
    const previous=enabled;
    busy.current=true;
    // Commit the visible switch before starting the server action/revalidation.
    flushSync(()=>{setPending(true);setEnabled(!previous);onPendingChange(true);onFeedback({label,status:"pending"});});
    void (async()=>{
      try {
        const result=await (save??saveCourseOwnIncomeAccess)({storeId,staffId,previous,enabled:!previous,permission});
        if (!result.success) {setEnabled(previous);setUncertain(result.uncertain===true);onFeedback({label,status:result.uncertain?"uncertain":"error",message:result.error});}
        else {setEnabled(result.data.enabled);onSaved(result.data);onFeedback({label,status:"saved"});}
      } catch {setUncertain(true);setEnabled(previous);onFeedback({label,status:"uncertain",message:"儲存結果未確認，請重新整理核對"});}
      finally {busy.current=false;setPending(false);onPendingChange(false);}
    })();
  }
  const title="我的工作權限";
  const detailStart=label.indexOf("（");
  const name=detailStart<0?label:label.slice(0,detailStart);
  const detail=detailStart<0?null:label.slice(detailStart+1,-1);
  return <section aria-label={title} className="rounded-lg border border-earth-200 bg-earth-50 px-3 py-1">
    <div className="text-sm">
      <label className="grid min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <span className="min-w-0 break-words leading-5"><span className="block">{name}</span>{detail&&<span className="block text-earth-600">{detail}</span>}</span>
        <span className="flex min-h-11 shrink-0 items-center gap-2">
          <NotificationSwitch checked={enabled} aria-checked={enabled} aria-label={label} disabled={!canEdit||pending||blocked||uncertain} style={pending?{opacity:1}:undefined} onChange={change}/>
          <span className="min-w-11 text-earth-600">{uncertain?"待核對":enabled?"開啟":"關閉"}</span>
        </span>
      </label>
      {!canEdit&&<span className="text-earth-600">僅老闆可修改</span>}
    </div>
  </section>;
}
