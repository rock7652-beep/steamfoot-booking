"use client";
import {ScheduleMonthGrid} from "@/components/admin/schedule-month-grid";
import styles from "@/app/(dashboard)/dashboard/courses/schedule-layout.module.css";
import {CourseScheduleBoard} from '@/app/(dashboard)/dashboard/courses/course-schedule-board';
import {CourseScheduleToolbar} from '@/components/admin/course-schedule-toolbar';
import {courseMonthDays} from '@/lib/course-calendar';
import {formatTWDateTime,toLocalDateStr,addTaiwanDuration} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import {useRouter} from 'next/navigation';
import type {ReactNode} from 'react';
export function BeautyScheduleWorkspace({data,onOpen,onCreate,pending,readOnly,actions}:{data:BeautyDashboardData;onOpen:(id:string)=>void;onCreate:()=>void;pending:boolean;readOnly:boolean;actions?:ReactNode}){
 const router=useRouter();
 const go=(date:string,calendar=data.calendar)=>router.push(`?tab=${encodeURIComponent('班表')}&date=${date}&calendar=${calendar}`,{scroll:false});
 const sessions=data.items.filter(b=>b.status!=='CANCELLED').map(b=>({id:b.id,templateId:b.serviceId,nameSnapshot:b.serviceName,startsAt:b.startsAt,endsAt:b.occupiedEndsAt,coachId:b.technicianId,roomId:b.locationId,capacity:1,pointCost:1,bookings:[{customerId:b.customerId,customerName:b.personName,status:b.status==='COMPLETED'?'ATTENDED':b.status,bookingKind:b.isTrial?'TRIAL':'REGULAR'}],service:{endsAt:b.endsAt,personName:b.personName,status:b.status,occupiedEndsAt:b.occupiedEndsAt,buffer:b.buffer}}));
 const board=<CourseScheduleBoard serviceMode businessProfile="FITNESS" mode={data.calendar==='week'?'week':'day'} selectedDate={data.date} today={toLocalDateStr()} sessions={sessions} rooms={data.locations} coaches={data.techs.map(t=>({id:t.id,displayName:t.name,status:t.active?'ACTIVE':'INACTIVE',courseCoachEnabled:t.active,courseQualificationsConfirmed:true}))} templates={data.services} pending={pending} canCreate={false} calendarDays={data.calendarDays} storePeriods={data.calendarDays[data.date]?.periods??[]} staffAvailability={[]} staffAvailabilityExceptions={[]} onOpenEmpty={onCreate} onSelectDate={date=>go(date)} onOpenSession={onOpen} />;
 return <section className="min-w-0 space-y-2"><CourseScheduleToolbar>
 <div className="inline-flex rounded-lg border border-earth-200 bg-white p-0.5">{(['day','week','month'] as const).map((mode,i)=><button className={`min-h-11 px-3 ${data.calendar===mode?'rounded-md bg-primary-50 font-semibold text-primary-900':''}`} key={mode} aria-pressed={data.calendar===mode} onClick={()=>go(data.date,mode)}>{['日表','週表','月表'][i]}</button>)}</div>
 <button className="min-h-11 px-3" aria-label="上一期" onClick={()=>go(addTaiwanDuration(data.date,data.calendar==='month'?-1:data.calendar==='week'?-7:-1,data.calendar==='month'?'MONTH':'DAY'))}>‹</button><input aria-label="班表日期" type="date" value={data.date} onChange={e=>e.target.value&&go(e.target.value)} className="min-h-11 rounded border border-earth-200 px-2"/><button className="min-h-11 px-3" aria-label="下一期" onClick={()=>go(addTaiwanDuration(data.date,data.calendar==='month'?1:data.calendar==='week'?7:1,data.calendar==='month'?'MONTH':'DAY'))}>›</button><button className="min-h-11 px-3" onClick={()=>go(toLocalDateStr())}>今天</button><span className="ml-auto">{sessions.length} 筆預約</span>{!readOnly&&data.access.writeAccess&&<button className="min-h-11 rounded-lg bg-primary-700 px-3 text-white" onClick={onCreate}>新增預約</button>}{actions}
 </CourseScheduleToolbar>
 {data.calendar!=='month'?board:<ScheduleMonthGrid offset={courseMonthDays(data.date.slice(0,7)).offset} pending={pending}>{courseMonthDays(data.date.slice(0,7)).dates.map(date=><div className={`${styles.monthDay} relative flex h-24 min-w-0 flex-col items-start border-t border-earth-100 px-1 py-1 text-left text-sm sm:px-3`} key={date}><button className="min-h-9 text-left text-primary-800" onClick={()=>go(date,'day')}>{Number(date.slice(-2))}</button>{sessions.filter(b=>toLocalDateStr(new Date(b.startsAt))===date).slice(0,2).map(b=><button className="min-h-7 truncate text-left text-primary-800" key={b.id} onClick={()=>onOpen(b.id)}>{formatTWDateTime(new Date(b.startsAt)).slice(11)} {b.nameSnapshot}</button>)}{sessions.filter(b=>toLocalDateStr(new Date(b.startsAt))===date).length>2&&<button onClick={()=>go(date,'day')}>查看全部</button>}</div>)}</ScheduleMonthGrid>}
 </section>;
}
