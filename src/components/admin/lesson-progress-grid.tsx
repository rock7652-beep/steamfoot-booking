"use client";
import type {CSSProperties} from 'react';
import styles from './lesson-progress-grid.module.css';
import {toLocalDateStr} from '@/lib/date-utils';
export type CompletedLesson={id:string;date:string;customerName?:string;courseName?:string};
/** Presentation only: callers supply the authoritative total and completed lessons. */
export function LessonProgressGrid({total,completed,unitLabel='堂',title='上課紀錄',completedLabel='已上',onSelect,columns=5,compact=false,showSummary=true,gridClassName=''}:{total:number;completed:CompletedLesson[];unitLabel?:string;title?:string;completedLabel?:string;onSelect?:(lesson:CompletedLesson)=>void;columns?:number;compact?:boolean;showSummary?:boolean;gridClassName?:string}){
 if(!Number.isInteger(total)||total<0||completed.length>total)return <p role="alert" className="py-3 text-sm text-amber-800">方案進度待核對，請查看完整紀錄。</p>;
 const ordered=[...completed].sort((a,b)=>a.date.localeCompare(b.date));
 return <section aria-label="方案使用進度" className={`space-y-3 ${compact?styles.compact:""}`}>
  {showSummary&&<div className="flex flex-wrap items-center justify-between gap-2 text-sm"><h3 className="font-medium text-primary-900">{title}</h3><span className="text-earth-600">{completedLabel} {completed.length}／{total} {unitLabel}</span></div>}
  <ol aria-label={`${total} ${unitLabel}進度`} tabIndex={0} className={`grid max-h-72 grid-cols-5 gap-2 overflow-y-auto overscroll-contain pr-1 ${gridClassName} ${compact?styles.compactGrid:""}`} style={compact?({"--lesson-narrow-columns":Math.max(1,Math.min(total,5)),"--lesson-wide-columns":Math.max(1,Math.min(total,10))} as CSSProperties):{gridTemplateColumns:`repeat(${Number.isInteger(columns)&&columns>=1&&columns<=5?columns:5}, minmax(0, 1fr))`}}>
   {Array.from({length:total},(_,index)=>{
    const lesson=ordered[index],day=lesson?toLocalDateStr(new Date(lesson.date)):'';
    const description=`第 ${index+1} ${unitLabel}${lesson?`，${day}${lesson.customerName?`，${lesson.customerName}`:''}`:'，尚無使用日期'}`;
    const style=`flex min-h-14 min-w-0 items-center justify-center rounded-lg border text-sm tabular-nums ${lesson?'border-primary-300 bg-primary-50 font-medium text-primary-800':'border-earth-200 bg-white'}`;
    return <li key={lesson?.id??`empty-${index}`} data-lesson-slot data-completed={!!lesson} aria-label={description}>
     {lesson&&onSelect?<button type="button" aria-label={description} className={`${style} w-full focus-visible:outline-2 focus-visible:outline-primary-700`} onClick={()=>onSelect(lesson)}><time dateTime={lesson.date}>{day.slice(5).replace('-','/')}</time></button>:<span className={style}>{lesson?<time dateTime={lesson.date}>{day.slice(5).replace('-','/')}</time>:''}</span>}
    </li>;
   })}
  </ol>
 </section>;
}
