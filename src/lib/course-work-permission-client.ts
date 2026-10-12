"use client";
import {courseWorkPermissionInput,savedCourseWorkPermission} from "./course-work-permission-save";
export async function saveCourseOwnIncomeAccess(input:unknown){
 const d=courseWorkPermissionInput.parse(input);
 try {
  const response=await fetch("/api/course/settings/work-permission",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});
  const payload=await response.json();
  if(payload?.success===false && typeof payload.error==="string")return {success:false as const,error:payload.error,uncertain:payload.uncertain===true};
  const result=savedCourseWorkPermission.safeParse(payload?.data);
  if(!response.ok || payload?.success!==true || !result.success || result.data.storeId!==d.storeId || result.data.staffId!==d.staffId || result.data.permission!==d.permission || result.data.enabled!==d.enabled)throw new Error("unconfirmed receipt");
  return {success:true as const,data:result.data};
 } catch{return {success:false as const,uncertain:true,error:"儲存結果未確認，請重新整理核對"};}
}
