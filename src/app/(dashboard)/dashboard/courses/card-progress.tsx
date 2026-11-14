"use client";
import {useEffect,useRef,useState} from 'react';
import {useCourseCardProgressReader} from '@/components/admin/use-course-card-progress-reader';
import {LessonProgressGrid,type CompletedLesson} from '@/components/admin/lesson-progress-grid';
import type {loadCourseCardProgress} from '@/server/actions/course-card-progress';
import {toLocalDateStr} from '@/lib/date-utils';
export function CourseCardProgress({cardId,customerId,storeId,dataScope,revision=0,showSummary=true,music=false,initialResult}:{cardId:string;customerId:string;storeId:string;dataScope?:'operational'|'legacy';revision?:number;showSummary?:boolean;music?:boolean;initialResult?:Awaited<ReturnType<typeof loadCourseCardProgress>>}){
 const reader=useCourseCardProgressReader(storeId,revision);
 const [retry,setRetry]=useState(0),[selected,setSelected]=useState<CompletedLesson|null>(null);
 const key=JSON.stringify([storeId,cardId,customerId,dataScope,revision,retry]);
 const initial=useRef({key,reader,value:initialResult});
 const [response,setResponse]=useState<{key:string;value:Awaited<ReturnType<typeof loadCourseCardProgress>>}|null>(()=>initialResult?{key,value:initialResult}:null);
 useEffect(()=>{if(initial.current.value&&initial.current.key===key&&initial.current.reader===reader)return;let active=true;reader.read({cardId,customerId,expectedStoreId:storeId,dataScope}).then(value=>{if(active)setResponse({key,value});}).catch(()=>{if(active)setResponse({key,value:{success:false,error:'讀取上課進度失敗，請重試'}});});return()=>{active=false;};},[reader,cardId,customerId,storeId,dataScope,key]);
 const result=response?.key===key?response.value:reader.peek({cardId,customerId,expectedStoreId:storeId,dataScope});
 if(!result)return <p role="status" className="py-3 text-sm text-earth-600">讀取上課進度中…</p>;
 if(!result.success)return <p role="alert" className="py-3 text-sm text-red-700">{result.error}<button type="button" className="min-h-11 px-3 underline" onClick={()=>{reader.invalidate({cardId,customerId,expectedStoreId:storeId,dataScope});setRetry(n=>n+1);}}>重試</button></p>;
 const purchase=result.data.canReadPrice?<p className="text-sm text-earth-600">{result.data.purchasedAt?`購買 ${toLocalDateStr(new Date(result.data.purchasedAt))} · `:""}方案金額 {result.data.purchasePrice==null?"待核對":`NT$ ${result.data.purchasePrice.toLocaleString("zh-TW")}`}</p>:null;
 if(!result.data.available)return <>{purchase}{result.data.reason&&<p className="py-3 text-sm text-earth-600">{result.data.reason}</p>}</>;
 const activeLesson=result.data.completed.find(lesson=>lesson.id===selected?.id);
 return <div className={showSummary?"my-4 space-y-2":"my-1 space-y-1"}>{purchase}{showSummary&&result.data.shared&&<p className="text-sm text-earth-600">共用方案 · 以下為整份方案的上課進度</p>}<LessonProgressGrid title="使用紀錄" completedLabel="已扣用" noShowLabel={music?"曠課":"未出席"} voided={result.data.voided} compact showSummary={showSummary} total={result.data.total} completed={result.data.completed} onSelect={setSelected}/>{activeLesson&&<p role="status" className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">{toLocalDateStr(new Date(activeLesson.date))}{activeLesson.usageKind==='NO_SHOW'?music?' · 曠課':' · 未出席':activeLesson.usageKind==='LEAVE'?' · 請假':''} · {activeLesson.customerName} · {activeLesson.courseName??'已上課'}</p>}</div>;
}
