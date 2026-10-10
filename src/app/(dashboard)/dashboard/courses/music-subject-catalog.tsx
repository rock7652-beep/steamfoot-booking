"use client";
import { CourseSetupStepBadge } from "@/components/admin/course-setup-step-badge";
import {useCourseDisplayOrder} from "@/components/admin/course-display-order";
import type {CourseOrderSnapshot} from "@/lib/course-display-order";

import {CourseTestDataFilter,isCourseTestData} from "@/components/admin/course-test-data-filter";
import {courseStatusImpact} from "@/server/actions/course-batch";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";
import {useCourseStatusRows} from "@/components/admin/course-status-button";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { savedMusicSubject, SETTINGS_SAVED } from "@/lib/music-subject-save";
import { useSettingsSave } from "@/components/admin/use-settings-save";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";
import { DashboardLink } from "@/components/dashboard-link";
export type MusicSubjectView={id:string;name:string;category:string;description:string;isActive:boolean;updatedAt:string};
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2";
const button="min-h-10 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function MusicSubjectCatalog({storeId,displayOrder,subjects:sourceSubjects,canCreate,canEdit,initialCreate=false}:{storeId:string;displayOrder?:CourseOrderSnapshot;subjects:MusicSubjectView[];canCreate:boolean;canEdit:boolean;initialCreate?:boolean}){
 const [receipts,setReceipts]=useState<MusicSubjectView[]>([]);
 const [lastSavedId,setLastSavedId]=useState<string|null>(null);
 const [snapshot,setSnapshot]=useState(sourceSubjects);
 if(snapshot!==sourceSubjects){setSnapshot(sourceSubjects);setReceipts(old=>old.filter(saved=>!sourceSubjects.some(row=>row.id===saved.id&&row.updatedAt>=saved.updatedAt)));}
 const confirmedSubjects=useMemo(()=>[...sourceSubjects.filter(row=>!receipts.some(saved=>saved.id===row.id)),...receipts],[sourceSubjects,receipts]);
 const [subjects,applyStatus,busyIds,setStatusBusy]=useCourseStatusRows(confirmedSubjects);
 const [hideTestData,setHideTestData]=useState(false);
 const [showInactive,setShowInactive]=useState(false);
 const [selected,setSelected]=useState<string[]>([]),[dirty,setDirty]=useState(false);
 const router=useRouter(),pathname=usePathname(),guided=!!useSearchParams().get("setupStep");
 const [search,setSearch]=useState(""),[category,setCategory]=useState(""),[status,setStatus]=useState("all");
 const [editing,setEditing]=useState<MusicSubjectView|null|undefined>(canCreate&&initialCreate?null:undefined),[error,setError]=useState("");
 const endpoint=/^(?:\/s\/[^/]+\/admin|\/hq)\/dashboard\/courses\/?$/.test(pathname)?`${pathname.replace(/\/$/,"")}/subjects`:"/api/courses/subjects";
 const mutation=useSettingsSave(endpoint,storeId,savedMusicSubject);
 const [pending,start]=useTransition();
 const saving=useRef(false);
 const [created,setCreated]=useState(false);
 useCourseDraftGuard(editing!==undefined&&dirty,pending);
 function close(){if(!pending&&(!dirty||window.confirm("尚有未儲存的修改，確定關閉？")))setEditing(undefined);}
 const order=useCourseDisplayOrder("subject",subjects,displayOrder,canEdit&&!search&&!category&&status==="all"&&!hideTestData&&!busyIds.length,s=>s.isActive);
 const categories=[...new Set(subjects.map(s=>s.category).filter(Boolean))].sort();
 const rows=subjects.filter(s=>s.id===lastSavedId||((!hideTestData||!isCourseTestData(s.name))&&(!search||s.name.includes(search)||s.category.includes(search))&&(!category||s.category===category)&&(status==="all"||s.isActive===(status==="active")))).sort((a,b)=>Number(b.isActive)-Number(a.isActive)||order.compare(a,b));
 const activeRows=rows.filter(s=>s.isActive),inactiveRows=rows.filter(s=>!s.isActive);
 const inactiveForced=status==="inactive"||!!search||!!category;
 const inactiveExpanded=inactiveForced||showInactive;
 const subjectRow=(s:MusicSubjectView)=><tr {...order.rowProps(s.id)} key={s.id} className={`border-t border-earth-100 ${s.isActive?"":"bg-earth-50/80 text-earth-400"}`}><td className="px-4 py-2 font-medium">{canEdit&&order.handle(s.id,s.name)}{canEdit&&<input type="checkbox" className="mr-2" aria-label={`選取 ${s.name}`} disabled={busyIds.includes(s.id)} checked={selected.includes(s.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/>} {s.name}{s.id===lastSavedId&&<span className="ml-2 text-sm text-primary-700">剛儲存</span>}</td><td className="px-4 py-2">{s.category||<span className={s.isActive?"rounded bg-amber-50 px-2 py-1 text-amber-800":""}>未分類</span>}</td><td className="px-4 py-2"><span className={s.isActive?"text-emerald-700":"rounded bg-earth-200 px-2 py-1 text-earth-600"}>{s.isActive?"上架":"下架"}</span></td><td className="flex gap-2 px-4 py-2">{canEdit&&<button className={`${button} bg-white text-earth-700`} disabled={busyIds.includes(s.id)} onClick={()=>{mutation.reset();setDirty(false);setError("");setEditing(s);}}>編輯</button>}<button className={`${button} bg-white text-earth-700`} onClick={()=>router.push(`${pathname}?view=plans&subjectId=${encodeURIComponent(s.id)}`)}>班型與學費</button></td></tr>;
 return <>{created&&<div role="status" className="flex flex-wrap items-center gap-2 text-sm text-primary-800"><span>教學項目已建立</span>{!guided&&<DashboardLink href="/dashboard/courses?view=plans&action=create&setupStep=plan" className="inline-flex min-h-11 items-center px-3 font-medium">下一步：設定班型與學費 →</DashboardLink>}</div>}<div className="flex flex-wrap items-center gap-2">
 <input aria-label="搜尋教學項目" className={`${field} max-w-xs`} placeholder="搜尋教學項目名稱或分類" value={search} onChange={e=>{setSelected([]);setSearch(e.target.value);}}/>
 <select aria-label="分類篩選" className={button} value={category} onChange={e=>{setSelected([]);setCategory(e.target.value);}}><option value="">全部分類</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
 <select aria-label="狀態篩選" className={button} value={status} onChange={e=>{setSelected([]);setStatus(e.target.value);}}><option value="all">全部狀態</option><option value="active">上架</option><option value="inactive">下架</option></select>
 {canCreate&&<button className={`${button} ml-auto bg-primary-700 text-white`} onClick={()=>{mutation.reset();setDirty(false);setError("");setEditing(null);}}>＋新增教學項目</button>}</div>
<div className="flex flex-wrap items-center gap-x-5 gap-y-1">
 <CourseTestDataFilter names={subjects.map(s=>s.name)} checked={hideTestData} onChange={v=>{setSelected([]);setHideTestData(v);}}/>
 {canEdit&&<CourseBatchBar key={`${hideTestData}:${search}:${category}:${status}`} kind="subject" blockedIds={busyIds} states={Object.fromEntries(rows.map(item=>[item.id,item.isActive]))} ids={rows.map(s=>s.id)} names={Object.fromEntries(rows.map(s=>[s.id,s.name]))} selected={selected} onChange={setSelected} onApplied={applyStatus} onPendingChange={setStatusBusy}/>}
</div>
 <div className="overflow-x-auto rounded-xl border border-earth-200"><table className="w-full text-left text-sm"><thead className="bg-primary-50 text-primary-900"><tr>{["教學項目名稱","分類","狀態","操作"].map(t=><th key={t} className="px-4 py-3">{t}</th>)}</tr></thead><tbody>{activeRows.map(subjectRow)}{inactiveRows.length>0&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={4} className="px-4 py-2"><button type="button" disabled={inactiveForced} className="flex min-h-9 w-full items-center justify-between text-left text-sm font-medium text-earth-600 disabled:cursor-default" onClick={()=>setShowInactive(v=>!v)}><span>下架教學項目（{inactiveRows.length}）</span><span>{inactiveForced?"篩選結果":inactiveExpanded?"收合":"展開"}</span></button></td></tr>}{inactiveExpanded&&inactiveRows.map(subjectRow)}</tbody></table>{!rows.length&&<p className="p-6 text-center text-earth-500">尚無符合的教學項目</p>}</div>
 <RightSheet open={editing!==undefined} onClose={close} presentation="centered" width={560} fitContent labelledById="music-subject-title">
 <header className="flex shrink-0 items-center justify-between border-b border-earth-200 p-4"><h2 id="music-subject-title" className="font-semibold">{editing?"編輯教學項目":"新增教學項目"}<CourseSetupStepBadge step="course" /></h2><button className={button} disabled={pending} onClick={close}>關閉</button></header>
 {editing!==undefined&&<form id="music-subject-form" onChange={()=>setDirty(true)} className="min-h-0 overflow-y-auto overscroll-contain p-4" onSubmit={e => {
   e.preventDefault();
   if(saving.current)return;
   saving.current=true;
   setError("");
   const d = new FormData(e.currentTarget);
   start(async () => {
     try {
       if (editing?.isActive && d.get("active") !== "yes") {
         const impact = await courseStatusImpact({kind: "subject", ids: [editing.id]});
         if (!impact.success) {
           setError(impact.error);
           return;
         }
         const message = `確認下架？已有 ${impact.count} 堂未結束課程，既有排課與歷史紀錄保留。`;
         if (!window.confirm(message)) return;
       }
       const result = await mutation.save({
         id: editing?.id,
         expectedUpdatedAt: editing?.updatedAt,
         name: d.get("name"),
         category: d.get("category"),
         description: d.get("description"),
         isActive: d.get("active") === "yes",
       });
       if (!result.success) {
         setError(result.error);
         return;
       }
       setReceipts(old=>[...old.filter(row=>row.id!==result.data.id),result.data]);
       // Keep the committed item visible even when an existing filter excludes it.
       setLastSavedId(result.data.id);if(!result.data.isActive)setShowInactive(true);
       window.dispatchEvent(new CustomEvent(SETTINGS_SAVED,{detail:{storeId}}));
       setDirty(false);
       setCreated(!editing&&d.get("active")==="yes");
       setEditing(undefined);
       // The authoritative receipt renders immediately; no page refresh is needed.
     } catch {
       setError("儲存失敗，輸入已保留，請重試");
     } finally { saving.current=false; }
   });
 }}>

 <fieldset disabled={pending||mutation.uncertain} className="grid gap-3 sm:grid-cols-2"><label className="sm:col-span-2">教學項目名稱（必填）<input autoFocus className={field} name="name" required maxLength={80} defaultValue={editing?.name??""}/></label>
 <label>分類（選填）<input className={field} name="category" list="music-subject-categories" maxLength={40} defaultValue={editing?.category??""}/><datalist id="music-subject-categories">{categories.map(c=><option key={c} value={c}/>)}</datalist></label>
 <label>狀態<select className={field} name="active" defaultValue={editing?.isActive===false?"no":"yes"}><option value="yes">上架</option><option value="no">下架</option></select></label>
 <details className="sm:col-span-2"><summary className="cursor-pointer py-2">教學項目介紹（選填）</summary><textarea aria-label="教學項目介紹" className={field} name="description" rows={3} maxLength={5000} defaultValue={editing?.description??""}/></details>
 {error&&<p role="alert" className="sm:col-span-2 text-red-700">{error}</p>}</fieldset>
 </form>}
 <footer className="sticky bottom-0 shrink-0 border-t border-earth-100 bg-white p-4"><button type="submit" form="music-subject-form" className="min-h-11 w-full rounded-lg bg-primary-700 px-4 text-white" disabled={pending}>{pending?"儲存中…":"儲存"}</button></footer>
 </RightSheet></>;
}
