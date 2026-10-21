"use client";
import type {ReactNode} from 'react';
import {courseMonthDays} from '@/lib/course-calendar';
export type PortalCalendarDay={date:string;count:number;closed:boolean;self?:boolean;shared?:boolean};
export function CoursePortalCalendar({month,selected,days,monthPicker,context,legend,unit='堂',markers=true,onSelect}:{month:string;selected:string;days:PortalCalendarDay[];monthPicker:ReactNode;context:ReactNode;legend:ReactNode;unit?:string;markers?:boolean;onSelect:(date:string)=>void}){
 return <section className="cp-card cp-calendar">{monthPicker}<div className="cp-context">{context}</div><div className="cp-week">{'日一二三四五六'.split('').map(d=><span key={d}>{d}</span>)}</div><div className="cp-days">{Array.from({length:courseMonthDays(month).offset},(_,i)=><span key={'blank'+i}/>)}{days.map(d=><button key={d.date} className={`${d.closed?'closed':''} ${selected===d.date?'selected':''}`} aria-pressed={selected===d.date} aria-label={`${d.date}${d.closed?' 公休':''} ${d.count}${unit}`} onClick={()=>onSelect(d.date)}><span>{Number(d.date.slice(-2))}</span>{d.closed&&<small>公休</small>}{d.count>0&&<small>{d.count}{unit}</small>}{markers&&<span className="cp-dots">{d.self&&<i className="self" aria-label="本人預約"/>}{d.shared&&<i className="shared" aria-label="代約／共卡預約"/>}</span>}</button>)}</div><p className="cp-legend">{legend}</p></section>;
}
