"use client";
import type {InitialStoreNoticeSummary} from "@/lib/store-notices";
import {useEffect,useId,useRef,useState} from "react";
import dynamic from "next/dynamic";
import {usePathname,useRouter} from "next/navigation";
import {markCourseStoreNotice,loadCourseStoreNoticeTarget} from "@/server/actions/course-store-notices";
import {loadCombinedCourseStoreNotices,markCourseDigitalManagerNotice} from "@/server/actions/course-digital-manager-notices";
import {COURSE_NOTICE_LABELS} from "@/lib/course-store-notices";
import type {StoreNoticeItem} from "@/lib/store-notices";
import {formatTWDateTime} from "@/lib/date-utils";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {ModalPanel} from "./modal-panel";
import {StoreNoticeBell} from "./store-notice-bell";
import type {StoreNoticeMarkResult} from "@/lib/store-notices";
async function markCombinedNotice(input:{storeId:string;id:string;handled:boolean;revision:number}):Promise<StoreNoticeMarkResult>{
 if(!input.id.startsWith("digital:"))return markCourseStoreNotice(input);
 const result=await markCourseDigitalManagerNotice({...input,id:input.id.slice(8)});
 return result.success?{...result,data:{...result.data,id:`digital:${result.data.id}`}}:result;
}
const NoticeCourseRoster=dynamic(()=>import("@/app/(dashboard)/dashboard/courses/roster").then(m=>m.CourseRoster),{loading:()=> <p role="status" className="p-3 text-sm">讀取中…</p>});
type TargetResult=Awaited<ReturnType<typeof loadCourseStoreNoticeTarget>>;
type TargetData=Extract<TargetResult,{success:true}>["data"];
export function CourseStoreNoticeBell({storeId,initialEnabled=false,initialSummary}:{storeId:string;initialEnabled?:boolean;initialSummary?:InitialStoreNoticeSummary|null}) {
 const router=useRouter(),pathname=usePathname();
 const courseHeading=useId(),generation=useRef(0),mounted=useRef(true);
 const [course,setCourse]=useState<StoreNoticeItem|null>(null),[target,setTarget]=useState<TargetData|null>(null),[targetError,setTargetError]=useState("");
 const [refreshKey,setRefreshKey]=useState(0);
 const targetReader=usePanelReader("course-notice-target",loadCourseStoreNoticeTarget,storeId,0);
 useEffect(()=>{mounted.current=true;const requestGeneration=generation;return()=>{mounted.current=false;requestGeneration.current++;};},[]);
 function refresh(){setRefreshKey(k=>k+1);}
 function closeCourse(){generation.current++;setCourse(null);setTarget(null);setTargetError("");refresh();}
 async function openCourse(n:StoreNoticeItem){
  const seq=++generation.current;setCourse(n);setTarget(null);setTargetError("");
  try{const r=await targetReader.read({storeId,id:n.id});if(!mounted.current||seq!==generation.current)return;
   if(!r.success){setTargetError(r.error);return;}if(r.storeId!==storeId){setTargetError("門市已切換");return;}setTarget(r.data);
  }catch{if(mounted.current&&seq===generation.current)setTargetError("課程讀取失敗，請重試");}
 }
 return <>
  <StoreNoticeBell initialEnabled={initialEnabled} initialSummary={initialSummary} storeId={storeId} namespace="course" labels={COURSE_NOTICE_LABELS} loadNotices={loadCombinedCourseStoreNotices} markNotice={markCombinedNotice} closeOnViewTarget={n=>n.kind==="PAYMENT"||n.kind==="LEAD"||n.kind==="SUPPORT"||n.kind==="DIGEST"} onViewTarget={n=>{const prefix=(pathname??"").split("/dashboard")[0];if(n.kind==="PAYMENT")router.push(`${prefix}/dashboard/revenue?status=PENDING`);else if(n.kind==="LEAD"||n.kind==="SUPPORT")router.push(`${prefix}/dashboard/digital-butler/leads${n.kind==="SUPPORT"?"?handoff=waiting":""}`);else if(n.kind==="DIGEST")router.push(`${prefix}/dashboard`);else void openCourse(n);}} targetLabel="查看課程" refreshKey={refreshKey}/>
  {course&&<ModalPanel open onClose={closeCourse} labelledById={courseHeading} width={1100}>
   <header className="flex items-center justify-between gap-2 border-b border-earth-200 p-3"><div className="min-w-0"><h2 id={courseHeading} className="text-base font-semibold text-primary-900">課程詳情</h2><p className="break-words text-sm text-earth-600">{target?.courseName??course.courseName}・{formatTWDateTime(new Date(target?.startsAt??course.startsAt))}</p></div><button type="button" className="min-h-11 shrink-0 px-3" onClick={closeCourse}>返回通知</button></header>
   <div className="max-h-[75dvh] overflow-y-auto p-3">
    {targetError?<div role="alert" className="text-sm text-red-700">{targetError}<button className="min-h-11 px-3" onClick={()=>void openCourse(course)}>重試</button></div>:target?<NoticeCourseRoster key={target.id} sessionId={target.id} {...target} onDone={()=>{targetReader.clear();refresh();}}/>:<p role="status" className="text-sm text-earth-500">讀取中…</p>}
   </div>
  </ModalPanel>}
 </>;
}
