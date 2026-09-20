"use client";
import {useEffect,useState,useTransition} from "react";
import {readCourseCompensation,saveCourseCompensation} from "@/server/actions/course-compensation";
import {COMPENSATION_LABELS as labels,COMPENSATION_UNITS as units,type CompensationRule} from "@/lib/course-compensation";
export function CourseCompensationEditor({templateId,staffId="",onDirty}:{templateId:string;staffId?:string;onDirty?:()=>void}){
 const [rules,setRules]=useState<CompensationRule[]>([]),[defaults,setDefaults]=useState<CompensationRule[]>([]),[revision,setRevision]=useState(0),[ready,setReady]=useState(false),[message,setMessage]=useState(""),[pending,start]=useTransition();
 useEffect(()=>{let alive=true;readCourseCompensation({templateId,staffId}).then(r=>{if(!alive)return;if(r.success){setDefaults(r.defaults);setRules(r.rules.length?r.rules:staffId&&r.defaults.length===1?[r.defaults[0]]:[]);setRevision(r.revision);setReady(true);}else setMessage(r.error);}).catch(()=>{if(alive)setMessage("無法讀取計酬設定，請重新開啟");});return()=>{alive=false};},[templateId,staffId]);
 const choices=staffId?defaults.map(r=>r.mode):(["CLASS","HOUR","SHARE"] as const);
 return <section className="space-y-2 rounded-xl border border-earth-200 p-3"><h3 className="font-medium">{staffId?"老師計酬方式（單選）":"開放計酬方式（可複選）"}</h3><p className="text-sm text-earth-600">{staffId?"沿用課程預設，可個別調整金額。":"勾選後填預設值，老師可選其中一種。"}儲存後供新排課使用，已排課次保留原設定。</p>
 {!ready&&<p role="status">{message||"讀取中…"}</p>}{ready&&choices.map(mode=>{const rule=rules.find(r=>r.mode===mode);return <div key={mode} className="flex flex-wrap items-center gap-2"><label className="flex min-h-11 items-center gap-2"><input type={staffId?"radio":"checkbox"} name={`compensation-${templateId}-${staffId}`} checked={!!rule} disabled={pending} onChange={e=>{onDirty?.();setMessage("");setRules(old=>e.target.checked?staffId?[defaults.find(r=>r.mode===mode)!]:[...old,{mode,value:0}]:old.filter(r=>r.mode!==mode));}}/>{labels[mode]}</label>{rule&&<label className="flex items-center gap-2"><input aria-label={`${labels[mode]}數值`} className="min-h-11 w-28 rounded border px-2" type="number" min="0" max={mode==="SHARE"?100:1000000} step="0.01" value={Number.isNaN(rule.value)?"":rule.value} disabled={pending} onChange={e=>{onDirty?.();setRules(old=>old.map(r=>r.mode===mode?{...r,value:e.target.value===""?NaN:Number(e.target.value)}:r));}}/>{units[mode]}</label>}</div>})}
 {ready&&staffId&&!choices.length&&<p>請先在課程設定開放計酬方式。</p>}
 {ready&&<button type="button" disabled={pending||!!staffId&&!rules.length||rules.some(r=>!Number.isFinite(r.value))} className="min-h-11 rounded-lg bg-primary-700 px-3 text-white disabled:opacity-50" onClick={()=>start(async()=>{try{const r=await saveCourseCompensation({templateId,staffId,rules,revision});setMessage(r.success?"計酬設定已儲存":r.error);if(r.success)setRevision(v=>v+1);}catch{setMessage("儲存失敗，請重試");}})}>{pending?"儲存中…":"儲存計酬設定"}</button>}{ready&&message&&<p role="status">{message}</p>}</section>;
}

export function CourseCompensationSection({name,...props}:{name:string;templateId:string;staffId?:string;onDirty?:()=>void}) {
 const [loaded,setLoaded]=useState(false);
 return <details className="rounded-lg border border-earth-200 p-3" onToggle={e=>{if(e.currentTarget.open)setLoaded(true);}}><summary className="min-h-11 cursor-pointer">{name} · 計酬設定</summary>{loaded&&<CourseCompensationEditor {...props}/>}</details>;
}
