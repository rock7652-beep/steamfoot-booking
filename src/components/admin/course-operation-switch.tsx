"use client";
import {saveCourseOperationSwitch} from "@/server/actions/course-store-notices";
import {OperationSettingSwitch} from "./operation-setting-switch";
export type CourseOperationWriter=(input:unknown)=>Promise<{success:false;error:string}|{success:true;data:{enabled:boolean}}>;
export function CourseOperationSwitch({setting,save=saveCourseOperationSwitch,eventName,...props}:{storeId:string;setting:"selfLeaveEnabled"|"selfRescheduleEnabled"|"backendNoticesEnabled";title:string;initialEnabled:boolean;canEdit:boolean;save?:CourseOperationWriter;eventName?:string}) {
 return <OperationSettingSwitch {...props} save={input=>save({...input,key:setting})} eventName={eventName??(setting==="backendNoticesEnabled"?"course-notices-setting":undefined)}/>;
}
