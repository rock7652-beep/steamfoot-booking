"use client";
import {useBeautyPersonnelText} from "@/components/course-personnel-label";
import {RightSheet} from '@/components/admin/right-sheet';
import {formatTWDateTime,toLocalDateStr} from '@/lib/date-utils';
const field='min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base';
const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50';
export type BeautyMoveInput={date:string;time:string;technicianId:string|null;locationId:string|null;reason:string};
export function BeautyMoveDialog({startsAt,date,technicians,locations,pending,error,onClose,onSubmit}:{startsAt:string;date:string;technicians:{id:string;name:string}[];locations:{id:string;name:string}[];pending:boolean;error?:string;onClose:()=>void;onSubmit:(input:BeautyMoveInput)=>void}){
 const beautyText=useBeautyPersonnelText();

 return <RightSheet open presentation="centered" fitContent width={640} maxHeight={600} labelledById="beauty-move-title" closeOnEscape={!pending} onClose={onClose}>
  <header className="flex shrink-0 items-center justify-between gap-3 border-b border-earth-200 px-4 py-3"><h2 id="beauty-move-title" className="font-semibold">{beautyText("改期／換技師位置")}</h2><button type="button" className={button} disabled={pending} onClick={onClose}>關閉</button></header>
  <form className="min-h-0 overflow-y-auto p-4" onSubmit={event=>{event.preventDefault();if(pending)return;const form=new FormData(event.currentTarget);onSubmit({date:String(form.get('date')),time:String(form.get('time')),technicianId:String(form.get('technicianId')??'')||null,locationId:String(form.get('locationId')??'')||null,reason:String(form.get('note'))});}}>
   <fieldset disabled={pending} className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
    <label>日期<input className={field} type="date" name="date" required defaultValue={startsAt?toLocalDateStr(new Date(startsAt)):date}/></label>
    <label>時間<input className={field} type="time" name="time" required defaultValue={startsAt?formatTWDateTime(new Date(startsAt)).slice(11):''}/></label>
    <label>{beautyText("技師")}<select className={field} name="technicianId"><option value="">保留偏好，自動安排</option>{technicians.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>位置<select className={field} name="locationId"><option value="">自動安排</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <label className="min-[420px]:col-span-2">原因／備註<input className={field} required name="note"/></label>
   </fieldset>
   {error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
   <footer className="mt-4 flex justify-end gap-2 border-t border-earth-100 pt-3"><button type="button" className={button} disabled={pending} onClick={onClose}>返回</button><button className={button+' bg-primary-700 text-white'} disabled={pending}>{pending?'處理中…':'確認'}</button></footer>
  </form>
 </RightSheet>;
}
