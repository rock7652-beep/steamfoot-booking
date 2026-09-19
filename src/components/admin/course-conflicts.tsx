"use client";
import { usePathname } from "next/navigation";
import {formatTWDateTime,toLocalDateStr} from "@/lib/date-utils";
export type ConflictItem={id:string;name:string;startsAt:string;capacity:number};
export function CourseConflicts({items}:{items:ConflictItem[]}){
 const path=usePathname();const prefix=path.includes('/s/')?path.split('/admin/')[0]+'/admin':'';
 return items.length?<ul aria-label="衝突課次" className="max-h-60 overflow-y-auto overscroll-contain rounded-lg border border-amber-200 p-3 text-sm">{items.map(s=><li key={s.id}><a className="inline-flex min-h-11 items-center text-primary-700 underline" href={`${prefix}/dashboard/courses?date=${toLocalDateStr(new Date(s.startsAt))}&session=${encodeURIComponent(s.id)}`}>{formatTWDateTime(new Date(s.startsAt))} {s.name} · 上限 {s.capacity} 人</a></li>)}</ul>:null;
}
