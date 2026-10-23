"use client";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {saveCourseOperationSwitch} from "@/server/actions/course-store-notices";
import {SettingsListRow} from "@/components/settings";
import {useSettingsPanelGuard} from "./settings-panel-context";
import {OperationSettingSwitch} from "./operation-setting-switch";
type Props={storeId:string;setting:"selfLeaveEnabled"|"selfRescheduleEnabled"|"backendNoticesEnabled";title:string;initialEnabled:boolean;canEdit:boolean;compact?:boolean;expanded?:boolean;onEdit?:()=>void;onClose?:()=>void};
export function CourseOperationSwitch(props:Props) {
 if(props.onEdit)return <CourseOperationEditor {...props}/>;
 const {setting,...rest}=props;
 return <OperationSettingSwitch {...rest} save={input=>saveCourseOperationSwitch({...input,key:setting})} eventName={setting==="backendNoticesEnabled"?"course-notices-setting":undefined}/>;
}
function CourseOperationEditor({storeId,setting,title,initialEnabled,canEdit,compact,expanded,onEdit,onClose}:Props){
 const [saved,setSaved]=useState(initialEnabled),[draft,setDraft]=useState(initialEnabled),[error,setError]=useState("");
 const [pending,start]=useTransition(),busy=useRef(false),router=useRouter();
 useSettingsPanelGuard(draft!==saved,pending);
 function cancel(){if(busy.current)return;setDraft(saved);setError("");onClose?.();}
 function save(){
  if(!canEdit||busy.current||draft===saved)return;
  busy.current=true;setError("");
  start(async()=>{try{
   const result=await saveCourseOperationSwitch({storeId,key:setting,enabled:draft,previous:saved});
   if(!result.success){setError(result.error);return;}
   setSaved(result.data.enabled);setDraft(result.data.enabled);onClose?.();router.refresh();
  }catch{setError("儲存未確認，請重新整理核對");}finally{busy.current=false;}});
 }
 return <SettingsListRow compact={compact} title={title} summary={saved?"開啟":"關閉"} expanded={!!expanded&&canEdit} onEdit={canEdit?onEdit:undefined}>
  <form className="space-y-3" onSubmit={e=>{e.preventDefault();save();}}>
   <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-earth-800"><input type="checkbox" checked={draft} disabled={pending} onChange={e=>{setDraft(e.target.checked);setError("");}}/>{title}</label>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   <div className="flex justify-end gap-2"><button type="button" disabled={pending} onClick={cancel} className="min-h-11 rounded-lg border border-earth-200 px-4 text-sm disabled:opacity-40">取消</button><button type="submit" disabled={pending||draft===saved} className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-40">{pending?"儲存中…":"儲存"}</button></div>
  </form>
 </SettingsListRow>;
}
