"use client";
import type {ReactNode} from 'react';
import {RightSheet} from '@/components/admin/right-sheet';
import {CourseSetupStepBadge} from '@/components/admin/course-setup-step-badge';

/** The native sports scheduling dialog, extracted unchanged from CourseWorkspace. */
export function SportsScheduleDialog({children,title='新增排課',busy,onClose,onDraft,fitContent=false}:{children:ReactNode;title?:string;busy:boolean;onClose:()=>void;onDraft?:()=>void;fitContent?:boolean}){
 return <RightSheet className="fitness-management-editor" presentation="centered" maxHeight={680} fitContent={fitContent} open onClose={onClose} width={920} labelledById="course-panel-title">
  <div className="flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-2">
   <h2 id="course-panel-title" className="text-base font-semibold text-primary-900">{title}<CourseSetupStepBadge step="schedule"/></h2>
   <div className="flex items-center gap-2"><button className="min-h-10 rounded-lg border border-earth-200 px-3 py-1.5 text-sm disabled:opacity-50" disabled={busy} onClick={onClose}>關閉</button></div>
  </div>
  <div onChangeCapture={event=>{if((event.target as HTMLElement).closest('form'))onDraft?.();}} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 [&_label]:min-w-0 [&_input]:min-w-0 [&_input]:max-w-full [&_input]:appearance-none">{children}</div>
 </RightSheet>;
}
