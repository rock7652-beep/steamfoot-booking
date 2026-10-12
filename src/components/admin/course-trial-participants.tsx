"use client";
import {useCallback,useEffect,useRef,useState,useTransition} from "react";
import {createCourseTrial} from "@/server/actions/course-trial";
import {CourseTrialPersonRow,type TrialPerson,type TrialPersonSettings} from "./course-trial-person-row";
export function CourseTrialParticipants({sessionId,capacity,occupiedCount,people,settings,canCreate,canCollect,canCorrect,canSupplement,onUpdated,onGuard}:{sessionId:string;capacity:number;occupiedCount:number;people:TrialPerson[];settings:TrialPersonSettings;canCreate:boolean;canCollect:boolean;canCorrect:boolean;canSupplement:boolean;onUpdated:()=>Promise<void>|void;onGuard?:(pending:boolean,dirty:boolean)=>void}) {
 const [pending,start]=useTransition();const [error,setError]=useState("");const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 const guards=useRef(new Map<string,{pending:boolean;dirty:boolean}>());
 const report=useCallback((id:string,pending:boolean,dirty:boolean)=>{guards.current.set(id,{pending,dirty});onGuard?.([...guards.current.values()].some(g=>g.pending),[...guards.current.values()].some(g=>g.dirty));},[onGuard]);
 useEffect(()=>{report("create",pending,false);return()=>report("create",false,false);},[pending,report]);
 return <section aria-label="體驗者" className="space-y-2 text-sm">
  <ul className="divide-y divide-earth-100 rounded-lg border border-earth-200">{people.map(person=><li key={person.id} className="px-3 py-1"><CourseTrialPersonRow person={person} settings={settings} canCollect={canCollect} canCorrect={canCorrect} canSupplement={canSupplement} onUpdated={onUpdated} onGuard={(pending,dirty)=>report(person.id,pending,dirty)}/></li>)}</ul>
  {canCreate&&<button type="button" className="min-h-11 px-3 text-primary-700 disabled:opacity-50" disabled={pending||occupiedCount>=capacity} onClick={()=>start(async()=>{setError("");try{const r=await createCourseTrial({sessionId,customerName:`體驗者 ${people.length+1}`,requestKey});if(!r.success){setError(r.error??"新增失敗");return;}setRequestKey(crypto.randomUUID());await onUpdated();}catch{setError("尚未確認新增結果，請核對後重試");}})}>{pending?"新增中…":occupiedCount>=capacity?"已滿班":"＋體驗者"}</button>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
 </section>;
}
