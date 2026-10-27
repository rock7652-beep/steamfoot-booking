'use client';
import {useEffect,useState} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {loadCourseChargeOptions} from '@/server/actions/course-charge';
import type {CourseChargeSettings} from '@/lib/course-charge-settings';
export type ScheduleCharge={id:string;name:string;price:number;open:boolean;settings:CourseChargeSettings;trialPrice:number|null};
export function CourseChargeSelect({templateId,trial,open=false,sports=false,onChange,onReady,onDefaultPrice}:{templateId:string;trial:boolean;open?:boolean;sports?:boolean;onChange:(charge:ScheduleCharge|null)=>void;onReady:(ready:boolean)=>void;onDefaultPrice?:(price:number)=>void}){
 const readKey=JSON.stringify([templateId,trial,open,sports]);
 const reader=usePanelReader('course-charge-options',loadCourseChargeOptions,'',0);
 const [data,setData]=useState<{key:string;rows:ScheduleCharge[];hasRows:boolean}|null>(null);
 const [selected,setSelected]=useState('');const [error,setError]=useState<{key:string;message:string}|null>(null);
 useEffect(()=>{let current=true;onReady(false);onChange(null);if(!templateId)return;
 reader.read(templateId).then(result=>{if(!current)return;setError(null);if(!result.success){setError({key:readKey,message:result.error??'收費方式讀取失敗'});return;}
 if(trial&&open)onDefaultPrice?.(result.defaultTrialPrice);
 const available=result.rows.filter(r=>!sports||r.open===open);
 const rows=available.filter(r=>!trial||result.enabled&&(open||r.open||r.settings.kind==='single'&&r.settings.trialPrice!==null)).map(r=>({...r,trialPrice:trial?(open||r.open?result.defaultTrialPrice:r.settings.trialPrice):null}));
 setData({key:readKey,rows,hasRows:available.length>0});setSelected(rows.length===1?rows[0].id:'');
 }).catch(()=>{if(current)setError({key:readKey,message:'收費方式讀取失敗'});});return()=>{current=false;};
 },[reader,templateId,trial,open,sports,readKey,onReady,onChange,onDefaultPrice]);
 const ready=data?.key===readKey;const charge=ready?data.rows.find(r=>r.id===selected)??null:null;
 useEffect(()=>{onChange(charge);onReady(!!ready&&(!data.hasRows&&(!trial||open)||!!charge));},[charge,ready,data,trial,open,onChange,onReady]);
 if(error?.key===readKey)return <p role="alert" className="col-span-full text-red-700">{error.message}</p>;
 if(!ready)return <p role="status" className="col-span-full">讀取收費方式…</p>;
 if(!data.hasRows)return trial&&!open?<p role="alert" className="col-span-full">此項目沒有開放體驗的單次收費，請先在收費方式設定體驗價。</p>:null;
 return <label className="col-span-full">收費方式<select aria-label="排課收費方式" className="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3" value={selected} onChange={e=>setSelected(e.target.value)} required><option value="">請選擇收費方式</option>{data.rows.map(r=><option key={r.id} value={r.id}>{r.name} · ${trial?r.trialPrice:r.price}</option>)}</select>{trial&&charge&&<span className="text-sm text-earth-600">{open||charge.open?'沿用店家預設體驗費':'體驗費'} ${charge.trialPrice}／人</span>}{!data.rows.length&&<span role="alert">此項目沒有開放體驗的單次收費</span>}</label>;
}
