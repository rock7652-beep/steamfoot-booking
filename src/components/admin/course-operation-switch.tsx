"use client";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {SettingsListRow} from "@/components/settings";
import {NotificationSwitch} from "./notification-switch";
import {saveCourseOperationSwitch} from "@/server/actions/course-store-notices";
export function CourseOperationSwitch({storeId,setting,title,initialEnabled,canEdit}:{storeId:string;setting:"selfLeaveEnabled"|"selfRescheduleEnabled"|"backendNoticesEnabled";title:string;initialEnabled:boolean;canEdit:boolean}) {
 const [enabled,setEnabled]=useState(initialEnabled),[error,setError]=useState("");
 const [pending,start]=useTransition();const busy=useRef(false);const router=useRouter();
 return <SettingsListRow title={title} summary={enabled?"開啟":"關閉"} controls={<NotificationSwitch aria-label={title} checked={enabled} disabled={!canEdit||pending} onChange={e=>{
  if(busy.current)return;const next=e.target.checked,previous=enabled;busy.current=true;setEnabled(next);setError("");
  start(async()=>{try{const r=await saveCourseOperationSwitch({storeId,key:setting,enabled:next,previous});if(!r.success){setEnabled(previous);setError(r.error);}else{setEnabled(r.data.enabled);if(setting==="backendNoticesEnabled")window.dispatchEvent(new Event("course-notices-setting"));router.refresh();}}catch{setEnabled(previous);setError("儲存結果未確認，請重新整理核對");}finally{busy.current=false;}});
 }}/>}>{error?<p role="alert" className="py-1 text-sm text-red-700">{error}</p>:null}</SettingsListRow>;
}
