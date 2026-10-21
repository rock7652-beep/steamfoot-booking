"use client";
import {saveCourseOperationSwitch} from "@/server/actions/course-store-notices";
import {OperationSettingSwitch} from "./operation-setting-switch";
export function CourseOperationSwitch({setting,...props}:{storeId:string;setting:"selfLeaveEnabled"|"selfRescheduleEnabled"|"backendNoticesEnabled";title:string;initialEnabled:boolean;canEdit:boolean}) {
 return <OperationSettingSwitch {...props} save={input=>saveCourseOperationSwitch({...input,key:setting})} eventName={setting==="backendNoticesEnabled"?"course-notices-setting":undefined}/>;
}
