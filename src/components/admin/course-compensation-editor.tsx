"use client";
import {useEffect,useState,useTransition} from "react";
import {readCourseCompensation,saveCourseCompensation} from "@/server/actions/course-compensation";
export function CourseCompensationEditor({templateId,staffId="",onDirty}:{templateId:string;staffId?:string;onDirty?:(dirty:boolean)=>void}){
 const [value,setValue]=useState("0"),[revision,setRevision]=useState(0),[ready,setReady]=useState(false),[message,setMessage]=useState(""),[pending,start]=useTransition();
 useEffect(()=>{let alive=true;readCourseCompensation({templateId,staffId}).then(r=>{if(!alive)return;if(r.success){setValue(String(r.rules.find(rule=>rule.mode==="CLASS")?.value??0));setRevision(r.revision);setReady(true);if(r.rules.some(rule=>rule.mode!=="CLASS"))setMessage("舊計酬方式已停用，請確認每堂授課費後儲存。既有排課紀錄保留。");}else setMessage(r.error);}).catch(()=>{if(alive)setMessage("無法讀取授課費，請重新開啟");});return()=>{alive=false};},[templateId,staffId]);
 return <section className="space-y-2 rounded-xl border border-earth-200 p-3"><h3 className="font-medium">每堂授課費（元）</h3><p className="text-sm text-earth-600">0 元表示不另計授課費。每堂只計一次，不依時長或學員人數增加。儲存後供新排課使用，既有課次保留原設定。</p>
 {!ready&&<p role="status">{message||"讀取中…"}</p>}
 {ready&&<label className="flex items-center gap-2"><input aria-label="每堂授課費" className="min-h-11 w-32 rounded border px-2" type="number" min="0" max="1000000" step="0.01" value={value} disabled={pending} onChange={e=>{onDirty?.(true);setValue(e.target.value);}}/>元／堂</label>}
 {ready&&<button type="button" disabled={pending||!staffId||value===""||!Number.isFinite(Number(value))||Number(value)<0} className="min-h-11 rounded-lg bg-primary-700 px-3 text-white disabled:opacity-50" onClick={()=>start(async()=>{try{const r=await saveCourseCompensation({templateId,staffId,rules:[{mode:"CLASS",value:Number(value)}],revision});setMessage(r.success?"每堂授課費已儲存":r.error);if(r.success){setRevision(v=>v+1);onDirty?.(false);}}catch{setMessage("儲存失敗，請重試");}})}>{pending?"儲存中…":"儲存授課費"}</button>}{ready&&message&&<p role="status">{message}</p>}</section>;
}
export function CourseCompensationSection({name,...props}:{name:string;templateId:string;staffId?:string;onDirty?:(dirty:boolean)=>void}) {
 const [loaded,setLoaded]=useState(false);
 return <details className="rounded-lg border border-earth-200 p-3" onToggle={e=>{if(e.currentTarget.open)setLoaded(true);}}><summary className="min-h-11 cursor-pointer">{name} · 每堂授課費</summary>{loaded&&<CourseCompensationEditor {...props}/>}</details>;
}
