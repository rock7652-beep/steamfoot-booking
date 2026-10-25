"use client";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {SettingsListRow} from "@/components/settings/settings-workspace";
import {NotificationSwitch} from "./notification-switch";
type SaveResult={success:false;error:string}|{success:true;data:{enabled:boolean}};
export function OperationSettingSwitch({storeId,title,initialEnabled,canEdit,save,eventName,compact=false}:{
 storeId:string;title:string;initialEnabled:boolean;canEdit:boolean;compact?:boolean;
 save:(input:{storeId:string;enabled:boolean;previous:boolean})=>Promise<SaveResult>;eventName?:string;
}) {
 const [enabled,setEnabled]=useState(initialEnabled),[error,setError]=useState("");
 const [pending,start]=useTransition(),busy=useRef(false),router=useRouter();
 return <SettingsListRow compact={compact} title={title} summary={enabled?"開啟":"關閉"} controls={<label className="inline-flex min-h-11 min-w-12 items-center justify-center"><NotificationSwitch aria-label={title} checked={enabled} disabled={!canEdit||pending} onChange={e=>{
  if(busy.current)return;const next=e.target.checked,previous=enabled;busy.current=true;setEnabled(next);setError("");
  start(async()=>{try{const r=await save({storeId,enabled:next,previous});if(!r.success){setEnabled(previous);setError(r.error);}else{setEnabled(r.data.enabled);if(eventName)window.dispatchEvent(new Event(eventName));router.refresh();}}catch{setEnabled(previous);setError("儲存結果未確認，請重新整理核對");}finally{busy.current=false;}});
 }}/> </label>}>{error?<p role="alert" className="py-1 text-sm text-red-700">{error}</p>:null}</SettingsListRow>;
}
