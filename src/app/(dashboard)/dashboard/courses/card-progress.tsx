"use client";
import {useEffect,useState} from 'react';
import {useCourseCardProgressReader} from '@/components/admin/use-course-card-progress-reader';
import {LessonProgressGrid,type CompletedLesson} from '@/components/admin/lesson-progress-grid';
import type {loadCourseCardProgress} from '@/server/actions/course-card-progress';
import {toLocalDateStr} from '@/lib/date-utils';
export function CourseCardProgress({cardId,customerId,storeId,dataScope,revision=0}:{cardId:string;customerId:string;storeId:string;dataScope?:'operational'|'legacy';revision?:number}){
 const reader=useCourseCardProgressReader(storeId,revision);
 const [retry,setRetry]=useState(0),[selected,setSelected]=useState<CompletedLesson|null>(null);
 const key=JSON.stringify([storeId,cardId,customerId,dataScope,revision,retry]);
 const [response,setResponse]=useState<{key:string;value:Awaited<ReturnType<typeof loadCourseCardProgress>>}|null>(null);
 useEffect(()=>{let active=true;reader.read({cardId,customerId,expectedStoreId:storeId,dataScope}).then(value=>{if(active)setResponse({key,value});}).catch(()=>{if(active)setResponse({key,value:{success:false,error:'讀取上課進度失敗，請重試'}});});return()=>{active=false;};},[reader,cardId,customerId,storeId,dataScope,key]);
 const result=response?.key===key?response.value:reader.get({cardId,customerId,expectedStoreId:storeId,dataScope});
 if(!result)return <p role="status" className="py-3 text-sm text-earth-600">讀取上課進度中…</p>;
 if(!result.success)return <p role="alert" className="py-3 text-sm text-red-700">{result.error}<button type="button" className="min-h-11 px-3 underline" onClick={()=>{reader.invalidate({cardId,customerId,expectedStoreId:storeId,dataScope});setRetry(n=>n+1);}}>重試</button></p>;
 if(!result.data.available)return <p className="py-3 text-sm text-earth-600">{result.data.reason}</p>;
 const activeLesson=result.data.completed.find(lesson=>lesson.id===selected?.id);
 return <div className="my-4 space-y-2">{result.data.shared&&<p className="text-sm text-earth-600">共用方案 · 以下為整份方案的上課進度</p>}<LessonProgressGrid compact total={result.data.total} completed={result.data.completed} onSelect={setSelected}/>{activeLesson&&<p role="status" className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">{toLocalDateStr(new Date(activeLesson.date))} · {activeLesson.customerName} · {activeLesson.courseName??'已上課'}</p>}</div>;
}
