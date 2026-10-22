"use client";
import { MUSIC_DEFAULT_DURATION_MINUTES } from "@/lib/music-teaching-item";
import {useCourseDisplayOrder} from "@/components/admin/course-display-order";
import type {CourseOrderSnapshot} from "@/lib/course-display-order";

import {CourseTestDataFilter,isCourseTestData} from "@/components/admin/course-test-data-filter";
import {courseStatusImpact} from "@/server/actions/course-batch";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";
import {useCourseStatusRows} from "@/components/admin/course-status-button";
import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { saveMusicSubject } from "@/server/actions/music-subject";
export type MusicSubjectView={id:string;name:string;category:string;description:string;isActive:boolean;updatedAt:string;classType?:string|null;durationMinutes?:number;capacity?:number;musicTeacherShare?:number;musicScheduleMode?:string|null;visibility?:string;precautions?:string};
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2";
const button="min-h-10 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function MusicSubjectCatalog({displayOrder,subjects:sourceSubjects,canCreate,canEdit}:{displayOrder?:CourseOrderSnapshot;subjects:MusicSubjectView[];canCreate:boolean;canEdit:boolean}){
 const [subjects,applyStatus,busyIds,setStatusBusy]=useCourseStatusRows(sourceSubjects);
 const [hideTestData,setHideTestData]=useState(false);
 const [showInactive,setShowInactive]=useState(false);
 const [selected,setSelected]=useState<string[]>([]),[dirty,setDirty]=useState(false);
 const router=useRouter(),pathname=usePathname();
 const [search,setSearch]=useState(""),[status,setStatus]=useState("all");
 const [editing,setEditing]=useState<MusicSubjectView|null|undefined>(undefined),[error,setError]=useState("");
 const [pending,start]=useTransition();
 function close(){if(!pending&&(!dirty||window.confirm("尚有未儲存的修改，確定關閉？")))setEditing(undefined);}
 const order=useCourseDisplayOrder("subject",subjects,displayOrder,canEdit&&!search&&status==="all"&&!hideTestData&&!busyIds.length,s=>s.isActive);
 const rows=subjects.filter(s=>(!hideTestData||!isCourseTestData(s.name))&&(!search||s.name.includes(search))&&(status==="all"||s.isActive===(status==="active"))).sort((a,b)=>Number(b.isActive)-Number(a.isActive)||order.compare(a,b));
 const activeRows=rows.filter(s=>s.isActive),inactiveRows=rows.filter(s=>!s.isActive);
 const inactiveForced=status==="inactive"||!!search;
 const inactiveExpanded=inactiveForced||showInactive;
 const subjectRow=(s:MusicSubjectView)=><tr {...order.rowProps(s.id)} key={s.id} className={`border-t border-earth-100 ${s.isActive?"":"bg-earth-50/80 text-earth-400"}`}><td className="px-4 py-2 font-medium">{canEdit&&order.handle(s.id,s.name)}{canEdit&&<input type="checkbox" className="mr-2" aria-label={`選取 ${s.name}`} disabled={busyIds.includes(s.id)} checked={selected.includes(s.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/>} {s.name}</td><td className="px-4 py-2">{s.durationMinutes??MUSIC_DEFAULT_DURATION_MINUTES} 分鐘</td><td className="px-4 py-2"><span className={s.isActive?"text-emerald-700":"rounded bg-earth-200 px-2 py-1 text-earth-600"}>{s.isActive?(s.visibility==="HIDDEN"?"僅後台安排":"開放預約"):"不開放"}</span></td><td className="flex gap-2 px-4 py-2">{canEdit&&<button className={`${button} bg-white text-earth-700`} disabled={busyIds.includes(s.id)} onClick={()=>{setDirty(false);setError("");setEditing(s);}}>編輯</button>}<button className={`${button} bg-white text-earth-700`} onClick={()=>router.push(`${pathname}?view=plans&subjectId=${encodeURIComponent(s.id)}`)}>收費方式</button></td></tr>;
 return <><div className="flex flex-wrap items-center gap-2">
 <input aria-label="搜尋教學項目" className={`${field} max-w-xs`} placeholder="搜尋教學項目" value={search} onChange={e=>{setSelected([]);setSearch(e.target.value);}}/>
 <select aria-label="狀態篩選" className={button} value={status} onChange={e=>{setSelected([]);setStatus(e.target.value);}}><option value="all">全部狀態</option><option value="active">上架</option><option value="inactive">下架</option></select>
 {canCreate&&<button className={`${button} ml-auto bg-primary-700 text-white`} onClick={()=>{setDirty(false);setError("");setEditing(null);}}>＋新增教學項目</button>}</div>
<div className="flex flex-wrap items-center gap-x-5 gap-y-1">
 <CourseTestDataFilter names={subjects.map(s=>s.name)} checked={hideTestData} onChange={v=>{setSelected([]);setHideTestData(v);}}/>
 {canEdit&&<CourseBatchBar key={`${hideTestData}:${search}:${status}`} kind="subject" blockedIds={busyIds} states={Object.fromEntries(rows.map(item=>[item.id,item.isActive]))} ids={rows.map(s=>s.id)} names={Object.fromEntries(rows.map(s=>[s.id,s.name]))} selected={selected} onChange={setSelected} onApplied={applyStatus} onPendingChange={setStatusBusy}/>}
</div>
 <div className="overflow-x-auto rounded-xl border border-earth-200"><table className="w-full text-left text-sm"><thead className="bg-primary-50 text-primary-900"><tr>{["項目名稱","預設時長","開放狀態","操作"].map(t=><th key={t} className="px-4 py-3">{t}</th>)}</tr></thead><tbody>{activeRows.map(subjectRow)}{inactiveRows.length>0&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={4} className="px-4 py-2"><button type="button" disabled={inactiveForced} className="flex min-h-9 w-full items-center justify-between text-left text-sm font-medium text-earth-600 disabled:cursor-default" onClick={()=>setShowInactive(v=>!v)}><span>下架課程（{inactiveRows.length}）</span><span>{inactiveForced?"篩選結果":inactiveExpanded?"收合":"展開"}</span></button></td></tr>}{inactiveExpanded&&inactiveRows.map(subjectRow)}</tbody></table>{!rows.length&&<p className="p-6 text-center text-earth-500">尚無符合的課程</p>}</div>
 <RightSheet open={editing!==undefined} onClose={close} presentation="centered" width={560} fitContent labelledById="music-subject-title">
 <div className="flex items-center justify-between border-b border-earth-200 p-4"><h2 id="music-subject-title" className="font-semibold">{editing?"編輯教學項目":"新增教學項目"}</h2><button className={button} disabled={pending} onClick={close}>關閉</button></div>
 {editing!==undefined&&<form onChange={()=>setDirty(true)} className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={e => {
   e.preventDefault();
   const d = new FormData(e.currentTarget);
   start(async () => {
     try {
       if (editing?.isActive && d.get("visibility") === "OFF") {
         const impact = await courseStatusImpact({kind: "subject", ids: [editing.id]});
         if (!impact.success) {
           setError(impact.error);
           return;
         }
         const message = `確認下架？已有 ${impact.count} 堂未結束課程，既有排課與歷史紀錄保留。`;
         if (!window.confirm(message)) return;
       }
       const result = await saveMusicSubject({
         id: editing?.id,
         durationMinutes: Number(d.get("durationMinutes")), visibility: d.get("visibility"),
         expectedUpdatedAt: editing?.updatedAt, name: d.get("name"),
         description: d.get("description"), precautions: d.get("precautions"),
       });
       if (!result.success) {
         setError(result.error);
         return;
       }
       setEditing(undefined);
       router.refresh();
     } catch {
       setError("儲存失敗，輸入已保留，請重試");
     }
   });
 }}>

 <fieldset disabled={pending} className="contents"><label className="sm:col-span-2">項目名稱<input autoFocus className={field} name="name" required maxLength={80} defaultValue={editing?.name??""}/></label>
 <label>預設時長（分鐘）<input className={field} name="durationMinutes" type="number" required min={1} max={480} list="music-item-durations" defaultValue={editing?.durationMinutes??MUSIC_DEFAULT_DURATION_MINUTES}/><datalist id="music-item-durations">{[30,45,50,60,90,120].map(n=><option key={n} value={n}/>)}</datalist></label>
 <label>開放狀態<select className={field} name="visibility" defaultValue={editing?.isActive===false?"OFF":editing?.visibility??"PUBLIC"}><option value="PUBLIC">開放預約</option><option value="HIDDEN">僅後台安排</option><option value="OFF">不開放</option></select></label>
 <details className="sm:col-span-2"><summary className="min-h-11 cursor-pointer py-2">更多設定</summary><div className="space-y-3"><label className="block">項目說明<textarea className={field} name="description" rows={3} maxLength={5000} defaultValue={editing?.description??""}/></label><label className="block">注意事項<textarea className={field} name="precautions" rows={3} maxLength={5000} defaultValue={editing?.precautions??""}/></label></div></details>
 {error&&<p role="alert" className="sm:col-span-2 text-red-700">{error}</p>}<button className="min-h-11 rounded-lg bg-primary-700 px-4 text-white sm:col-span-2" disabled={pending}>{pending?"儲存中…":"儲存"}</button></fieldset>
 </form>}
 </RightSheet></>;
}
