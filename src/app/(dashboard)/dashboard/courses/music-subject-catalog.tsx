"use client";
import {CourseTestDataFilter,isCourseTestData} from "@/components/admin/course-test-data-filter";
import {courseStatusImpact} from "@/server/actions/course-batch";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";
import {useCourseStatusRows} from "@/components/admin/course-status-button";
import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { saveMusicSubject } from "@/server/actions/music-subject";
export type MusicSubjectView={id:string;name:string;category:string;description:string;isActive:boolean;updatedAt:string};
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2";
const button="min-h-10 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function MusicSubjectCatalog({subjects:sourceSubjects,canCreate,canEdit}:{subjects:MusicSubjectView[];canCreate:boolean;canEdit:boolean}){
 const [subjects,applyStatus,busyIds,setStatusBusy]=useCourseStatusRows(sourceSubjects);
 const [hideTestData,setHideTestData]=useState(false);
 const [selected,setSelected]=useState<string[]>([]),[dirty,setDirty]=useState(false);
 const router=useRouter(),pathname=usePathname();
 const [search,setSearch]=useState(""),[category,setCategory]=useState(""),[status,setStatus]=useState("all");
 const [editing,setEditing]=useState<MusicSubjectView|null|undefined>(undefined),[error,setError]=useState("");
 const [pending,start]=useTransition();
 function close(){if(!pending&&(!dirty||window.confirm("尚有未儲存的修改，確定關閉？")))setEditing(undefined);}
 const categories=[...new Set(subjects.map(s=>s.category).filter(Boolean))].sort();
 const rows=subjects.filter(s=>(!hideTestData||!isCourseTestData(s.name))&&(!search||s.name.includes(search)||s.category.includes(search))&&(!category||s.category===category)&&(status==="all"||s.isActive===(status==="active"))).sort((a,b)=>Number(b.isActive)-Number(a.isActive)||a.category.localeCompare(b.category,"zh-Hant")||a.name.localeCompare(b.name,"zh-Hant"));
 return <><div className="flex flex-wrap items-center gap-2">
 <input aria-label="搜尋課程" className={`${field} max-w-xs`} placeholder="搜尋課程名稱或分類" value={search} onChange={e=>{setSelected([]);setSearch(e.target.value);}}/>
 <select aria-label="分類篩選" className={button} value={category} onChange={e=>{setSelected([]);setCategory(e.target.value);}}><option value="">全部分類</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
 <select aria-label="狀態篩選" className={button} value={status} onChange={e=>{setSelected([]);setStatus(e.target.value);}}><option value="all">全部狀態</option><option value="active">上架</option><option value="inactive">下架</option></select>
 {canCreate&&<button className={`${button} ml-auto bg-primary-700 text-white`} onClick={()=>{setDirty(false);setError("");setEditing(null);}}>＋新增課程</button>}</div>
 <CourseTestDataFilter names={subjects.map(s=>s.name)} checked={hideTestData} onChange={v=>{setSelected([]);setHideTestData(v);}}/>
 {canEdit&&<CourseBatchBar key={`${hideTestData}:${search}:${category}:${status}`} kind="subject" blockedIds={busyIds} ids={rows.map(s=>s.id)} names={Object.fromEntries(rows.map(s=>[s.id,s.name]))} selected={selected} onChange={setSelected} onApplied={applyStatus} onPendingChange={setStatusBusy}/>}
 <div className="overflow-x-auto rounded-xl border border-earth-200"><table className="w-full text-left text-sm"><thead className="bg-primary-50 text-primary-900"><tr>{["課程名稱","分類","狀態","操作"].map(t=><th key={t} className="px-4 py-3">{t}</th>)}</tr></thead><tbody>{rows.map(s=><tr key={s.id} className="border-t border-earth-100"><td className="px-4 py-2 font-medium">{canEdit&&<input type="checkbox" className="mr-2" aria-label={`選取 ${s.name}`} disabled={busyIds.includes(s.id)} checked={selected.includes(s.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/>} {s.name}</td><td className="px-4 py-2">{s.category||"未分類"}</td><td className="px-4 py-2">{s.isActive?"上架":"下架"}</td><td className="flex gap-2 px-4 py-2">{canEdit&&<button className={button} disabled={busyIds.includes(s.id)} onClick={()=>{setDirty(false);setError("");setEditing(s);}}>編輯</button>}<button className={button} onClick={()=>router.push(`${pathname}?view=plans&subjectId=${encodeURIComponent(s.id)}`)}>收費方案</button></td></tr>)}</tbody></table>{!rows.length&&<p className="p-6 text-center text-earth-500">尚無符合的課程</p>}</div>
 <RightSheet open={editing!==undefined} onClose={close} presentation="centered" width={560} fitContent labelledById="music-subject-title">
 <div className="flex items-center justify-between border-b border-earth-200 p-4"><h2 id="music-subject-title" className="font-semibold">{editing?"編輯課程":"新增課程"}</h2><button className={button} disabled={pending} onClick={close}>關閉</button></div>
 {editing!==undefined&&<form onChange={()=>setDirty(true)} className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);start(async()=>{try{if(editing?.isActive&&d.get("active")!=="yes"){const impact=await courseStatusImpact({kind:"subject",ids:[editing.id]});if(!impact.success){setError(impact.error);return;}if(!window.confirm(`確認下架？已有 ${impact.count} 堂未結束課程，既有排課與歷史紀錄保留。`))return;}const r=await saveMusicSubject({id:editing?.id,expectedUpdatedAt:editing?.updatedAt,name:d.get("name"),category:d.get("category"),description:d.get("description"),isActive:d.get("active")==="yes"});if(!r.success){setError(r.error);return;}setEditing(undefined);router.refresh();}catch{setError("儲存失敗，輸入已保留，請重試");}});}}>
 <fieldset disabled={pending} className="contents"><label className="sm:col-span-2">課程名稱<input autoFocus className={field} name="name" required maxLength={80} defaultValue={editing?.name??""}/></label>
 <label>分類<input className={field} name="category" list="music-subject-categories" maxLength={40} defaultValue={editing?.category??""}/><datalist id="music-subject-categories">{categories.map(c=><option key={c} value={c}/>)}</datalist></label>
 <label>狀態<select className={field} name="active" defaultValue={editing?.isActive===false?"no":"yes"}><option value="yes">上架</option><option value="no">下架</option></select></label>
 <details className="sm:col-span-2"><summary className="cursor-pointer py-2">課程介紹（選填）</summary><textarea aria-label="課程介紹" className={field} name="description" rows={3} maxLength={5000} defaultValue={editing?.description??""}/></details>
 {error&&<p role="alert" className="sm:col-span-2 text-red-700">{error}</p>}<button className="min-h-11 rounded-lg bg-primary-700 px-4 text-white sm:col-span-2" disabled={pending}>{pending?"儲存中…":"儲存"}</button></fieldset>
 </form>}
 </RightSheet></>;
}
