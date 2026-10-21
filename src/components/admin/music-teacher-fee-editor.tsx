"use client";
import { courseTemplateLabel } from "@/lib/course-template-presentation";
import { useState } from "react";
import type { MusicTeacherSettings } from "@/lib/music-teacher-settings";
export type TeacherFeeDraft = { mode: "CLASS" | "SHARE" | "HOUR" | "INHERIT"; value: string; revision: number };
export type TeacherPlan = { displayName?:string;currentTeaching?:boolean;isActive?:boolean;id: string; name: string; musicSubjectId?: string | null; subjectName?: string; musicTeacherShare?: number | null; musicPricePerLesson?: number | null };
const courseName=courseTemplateLabel;
const input = "min-h-11 min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-sm";
function feeSummary(plan: TeacherPlan, draft: TeacherFeeDraft | undefined, settings: MusicTeacherSettings) {
 const rule = draft && draft.mode !== "INHERIT" ? {mode:draft.mode,value:Number(draft.value)} : plan.musicSubjectId && settings.subjectRules[plan.musicSubjectId] ? settings.subjectRules[plan.musicSubjectId] : {mode:"SHARE",value:(settings.defaultRatio ?? plan.musicTeacherShare ?? NaN)*100};
 if (draft && draft.mode !== "INHERIT" && !draft.value.trim()) return "請填分潤";
 if (!Number.isFinite(rule.value)) return "尚未設定分潤";
 const teacherSpecific = !!(draft && draft.mode !== "INHERIT") || !!(plan.musicSubjectId && settings.subjectRules[plan.musicSubjectId]) || settings.defaultRatio != null;
 if (rule.mode === "CLASS") return `固定鐘點 · $${rule.value.toLocaleString("zh-TW")}／堂`;
 const amount = plan.musicPricePerLesson == null ? "" : ` · 定價試算 $${Number((plan.musicPricePerLesson*rule.value/100).toFixed(2)).toLocaleString("zh-TW")}／堂`;
 return `${teacherSpecific ? "彈性拆帳" : "一般拆帳"} · ${Number(rule.value.toFixed(2))}%${amount}`;
}
export function MusicTeacherFeeEditor({templates,qualificationIds,fees,settings,onSettings,onFees,onQualification,invalidTemplateId,readOnly=false,qualificationReadOnly=readOnly}:{invalidTemplateId?:string;readOnly?:boolean;qualificationReadOnly?:boolean;templates:TeacherPlan[];qualificationIds:string[];fees:Record<string,TeacherFeeDraft>;settings:MusicTeacherSettings;onSettings:(s:MusicTeacherSettings)=>void;onFees:(f:Record<string,TeacherFeeDraft>)=>void;onQualification:(id:string,selected:boolean)=>void}) {
 const [courseSearch,setCourseSearch]=useState("");
 const [courseScope,setCourseScope]=useState<"all"|"selected"|"unselected">("all");
 const [subject,setSubject]=useState("");
 const [page,setPage]=useState(0);
 const [showOther,setShowOther]=useState(false);
 const [editingId,setEditingId]=useState("");
 const subjects=[...new Set(templates.map(t=>t.subjectName).filter((v):v is string=>!!v))].sort();
 const otherCount=templates.filter(t=>t.currentTeaching===false&&!qualificationIds.includes(t.id)).length;
 const visibleCourses=templates.filter(t=>(showOther||t.currentTeaching!==false||qualificationIds.includes(t.id))&&(!courseSearch.trim()||`${courseName(t)} ${t.subjectName??""}`.toLocaleLowerCase().includes(courseSearch.trim().toLocaleLowerCase()))&&(!subject||t.subjectName===subject)&&(courseScope==="all"||(courseScope==="selected")===qualificationIds.includes(t.id)));
 const pages=Math.max(1,Math.ceil(visibleCourses.length/10));
 const current=Math.min(page,pages-1);
 const invalidPlan=invalidTemplateId?templates.find(t=>t.id===invalidTemplateId):undefined;
 const displayed=invalidPlan?[invalidPlan]:visibleCourses.slice(current*10,(current+1)*10);
 function editFee(plan:TeacherPlan){setEditingId(plan.id);if(!fees[plan.id]||fees[plan.id].mode==="INHERIT"){const ratio=settings.defaultRatio??plan.musicTeacherShare;onFees({...fees,[plan.id]:{mode:"SHARE",value:ratio==null?"":String(Number((ratio*100).toFixed(2))),revision:fees[plan.id]?.revision??0}});}}
 return <div className="space-y-3">
  {!!qualificationIds.length && <section className="space-y-2 border-b border-earth-100 pb-3"><h3 className="font-medium text-primary-900">預設薪酬</h3>
   <div className="flex flex-wrap items-center gap-2"><label className="flex flex-wrap items-center gap-2 text-sm">拆帳比例<input disabled={readOnly} aria-label="教師拆帳比例" className={`${input} w-24`} type="number" min="0" max="100" step="0.01" value={settings.defaultRatio==null?"":Number((settings.defaultRatio*100).toFixed(2))} placeholder="依課程設定" onChange={e=>onSettings({...settings,defaultRatio:e.target.value===""?null:Number(e.target.value)/100})}/><span>% 給老師</span></label>{settings.defaultRatio!==null&&!readOnly&&<button type="button" className="min-h-11 px-2 text-sm text-primary-800" onClick={()=>onSettings({...settings,defaultRatio:null})}>沿用課程設定</button>}</div>
   <p className="text-sm text-earth-500">{settings.defaultRatio===null?"一般拆帳・依各課程設定":"彈性拆帳・此教師專用比例"}・僅套用新課次</p>
  </section>}
  <h3 className="font-medium text-primary-900">可授課程 <span className="text-sm font-normal text-earth-500">已選 {qualificationIds.length} 項</span></h3>
  <div data-browse-control className="grid gap-2 sm:grid-cols-3"><input className={input} aria-label="搜尋課程" placeholder="搜尋課程" value={courseSearch} onChange={e=>{setCourseSearch(e.target.value);setPage(0);}}/><select className={input} aria-label="課程選取狀態" value={courseScope} onChange={e=>{setCourseScope(e.target.value as typeof courseScope);setPage(0);}}><option value="all">全部課程</option><option value="selected">已勾選</option><option value="unselected">未勾選</option></select>{subjects.length>1&&<select className={input} aria-label="科目篩選" value={subject} onChange={e=>{setSubject(e.target.value);setPage(0);}}><option value="">全部科目</option>{subjects.map(name=><option key={name}>{name}</option>)}</select>}</div>
  {otherCount>0&&<button type="button" aria-expanded={showOther} className="min-h-11 text-sm text-primary-800" onClick={()=>{setShowOther(v=>!v);setPage(0);}}>{showOther?"收合其他項目":`其他項目（${otherCount}）`}</button>}
  <details data-browse-control><summary className="min-h-11 cursor-pointer py-2 text-sm text-primary-800">批次選擇・篩選結果 {visibleCourses.length} 項</summary><div className="flex flex-wrap gap-2"><button type="button" disabled={qualificationReadOnly||!visibleCourses.length} className={input} onClick={()=>visibleCourses.forEach(t=>{if(!qualificationIds.includes(t.id))onQualification(t.id,true);})}>勾選這 {visibleCourses.length} 項</button><button type="button" disabled={qualificationReadOnly||!visibleCourses.some(t=>qualificationIds.includes(t.id))} className={input} onClick={()=>visibleCourses.forEach(t=>{if(qualificationIds.includes(t.id))onQualification(t.id,false);})}>取消這 {visibleCourses.length} 項</button></div></details>
  <div className="divide-y divide-earth-100 rounded-lg border border-earth-200">{displayed.map(plan=>{
   const selected=qualificationIds.includes(plan.id),draft=fees[plan.id],editing=selected&&(editingId===plan.id||invalidTemplateId===plan.id||!!draft&&draft.mode!=="INHERIT");
   return <div key={plan.id} className="space-y-2 px-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm"><input type="checkbox" disabled={qualificationReadOnly} checked={selected} onChange={e=>onQualification(plan.id,e.target.checked)}/><span className="min-w-0 break-words">{courseName(plan)}{plan.currentTeaching===false&&<span className="ml-2 text-earth-500">{plan.isActive===false?"停用":"未販售"}</span>}</span></label>
     {selected&&<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><span className="text-earth-600">{(!draft||draft.mode==="INHERIT")?"沿用預設・":""}{feeSummary(plan,draft,settings)}</span>{!readOnly&&!editing&&<button type="button" className={input} onClick={()=>editFee(plan)}>修改薪酬</button>}</div>}
    </div>
    {editing&&draft&&<div className="flex flex-wrap items-center gap-2"><select disabled={readOnly} className={input} aria-label={`${courseName(plan)}拆帳方式`} value={draft.mode} onChange={e=>onFees({...fees,[plan.id]:{...draft,mode:e.target.value as "CLASS"|"SHARE",value:""}})}><option value="SHARE">彈性拆帳</option><option value="CLASS">固定鐘點（元／堂）</option></select><input disabled={readOnly} className={`${input} w-24`} aria-invalid={invalidTemplateId===plan.id||undefined} aria-label={`${courseName(plan)}拆帳數值`} type="number" min="0" max={draft.mode==="SHARE"?100:1000000} step="0.01" value={draft.value} required onChange={e=>onFees({...fees,[plan.id]:{...draft,value:e.target.value}})}/><span className="text-sm">{draft.mode==="SHARE"?"% 給老師":"元／堂"}</span>{!readOnly&&<button type="button" className="min-h-11 px-2 text-sm text-primary-800" onClick={()=>{setEditingId("");onFees({...fees,[plan.id]:{...draft,mode:"INHERIT",value:""}});}}>沿用預設</button>}{invalidTemplateId===plan.id&&<p role="alert" className="w-full text-sm text-red-700">請填有效的薪酬數值</p>}</div>}
   </div>;
  })}{!displayed.length&&<p className="p-3 text-sm text-earth-500">沒有符合的課程</p>}</div>
  {pages>1&&!invalidPlan&&<nav data-browse-control aria-label="授課設定分頁" className="flex flex-wrap items-center justify-end gap-2 text-sm"><span>第 {current+1}／{pages} 頁</span><button type="button" className={input} disabled={!current} onClick={()=>setPage(current-1)}>上一頁</button><button type="button" className={input} disabled={current+1>=pages} onClick={()=>setPage(current+1)}>下一頁</button></nav>}
 </div>;
}
