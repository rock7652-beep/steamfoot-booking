"use server";
import {requirePermission,checkPermission} from "@/lib/permissions";
import {getActiveStoreForRead} from "@/lib/store";
import {getStoreIndustryModule} from "@/lib/industry-module-server";
import {resolveStoreViewContextFromCookie} from "@/lib/store-view-context-server";
import {hasStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";
import {isCourseSettingsPanel} from "@/lib/course-settings-panels";
import {Content} from "@/app/(dashboard)/dashboard/courses/settings-panel-content";
/** Read only. Existing pages retain their destination permission and business checks. */
export async function readCourseSettingsPanel(expectedStoreId:string,panel:string,query:string){
 const user=await requirePermission("booking.read");
 const storeId=await getActiveStoreForRead(user);
 if(!storeId||storeId!==expectedStoreId||!["ADMIN","OWNER","PARTNER"].includes(user.role)||await getStoreIndustryModule(storeId)!=="course"||!isCourseSettingsPanel(panel))throw new Error("無權限讀取此設定");
 const feature=panel==="reminders"?FEATURES.LINE_REMINDER:panel==="referral"?FEATURES.REFERRAL_SHARE:panel==="butler"?FEATURES.DIGITAL_BUTLER:undefined;
 if(feature){
  const permission=panel==="reminders"?"business_hours.manage":"plans.edit";
  if((await resolveStoreViewContextFromCookie(user))?.isViewMode||!(await checkPermission(user.role,user.staffId,permission))||!(await hasStoreFeature(storeId,feature)))throw new Error("此設定未開通或沒有權限");
 }
 const started=performance.now();
 let content;
 try{content=await Content({panel,query});}
 catch(error){
  const digest=error&&typeof error==="object"&&"digest" in error?String(error.digest):"";
  // Destination pages retain their checks, but a denied local read must not redirect the host page.
  if(digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")||digest.startsWith("NEXT_REDIRECT"))throw new Error("無權限讀取此設定，請核對目前門市與權限。");
  throw error;
 }
 console.info("[SETTINGS_PANEL_SERVER_PERF]",{panel,readMs:Math.round(performance.now()-started)});
 return {storeId,panel,query,content};
}
