'use client';
import {ReminderSettingRow,ReminderSettingsList} from '@/components/admin/reminder-settings-list';
import {useCoursePersonnelText} from "@/components/course-personnel-label";
import { useKeyedReminderMutation } from "../../reminders/reminder-setting-feedback";
import { courseDisplayText } from "@/lib/course-display-text";
import {NotificationSwitch} from '@/components/admin/notification-switch';
import {CoachNotificationPreview} from '@/components/admin/coach-notification-preview';
import {useSettingsPanelGuard} from '@/components/admin/settings-panel-context';
import { useState,useOptimistic } from 'react';
import { toast } from 'sonner';
import { setCoachNotification } from '@/server/actions/course-coach-notifications';
import { COACH_NOTICE_KINDS,COACH_NOTICE_LABELS,type CoachNoticeKind } from '@/lib/course-coach-notifications';
import { PERSONNEL_NEXT_DAY_REMINDER_TIME } from '@/lib/reminder-schedule';
export function CoachNotificationSettings({initial,teachers,logs,music=false}:{music?:boolean;initial:Record<CoachNoticeKind,boolean>;teachers:{id:string;name:string;bound:boolean}[];logs:{id:string;name:string;kind:CoachNoticeKind;status:string;reason:string;time:string}[]}) {
  const personnelText = useCoursePersonnelText();
 const [settings,setSettings]=useState(initial);
 const [display,patch]=useOptimistic(settings,(current,change:{kind:CoachNoticeKind;enabled:boolean})=>({...current,[change.kind]:change.enabled}));
 const mutation=useKeyedReminderMutation();
 const pending=mutation.pending;
 useSettingsPanelGuard(false,pending);
 const descriptions={DIGEST:`前一天 ${PERSONNEL_NEXT_DAY_REMINDER_TIME}（台灣時間）· 本人明日課程`,CHANGE:'調課、停課、取消與代課',TRIAL:'新增體驗學員及已通知資料異動'};
 const statuses:Record<string,string>={READY:'待發送',PENDING:'處理中',SENT:'已發送',SKIPPED:'已跳過',FAILED:'待重試',BLOCKED:'需確認'};
 return <div className="space-y-4"><ReminderSettingsList label={personnelText(music ? "老師通知" : "教練通知")}>
 {COACH_NOTICE_KINDS.map(kind=><ReminderSettingRow key={kind} title={COACH_NOTICE_LABELS[kind]} description={descriptions[kind]} action="預覽" pending={mutation.isPending(kind)} error={mutation.errors[kind]} control={<><span className="text-sm text-earth-500">{mutation.isPending(kind)?'儲存中…':display[kind]?'開啟':'關閉'}</span><NotificationSwitch aria-label={COACH_NOTICE_LABELS[kind]} checked={display[kind]} disabled={mutation.isPending(kind)} aria-busy={mutation.isPending(kind)} onChange={e=>{const enabled=e.target.checked;void mutation.run(kind,()=>setCoachNotification({kind,enabled}),()=>{setSettings(s=>({...s,[kind]:enabled}));toast.success('通知設定已儲存');},()=>{const previous=display[kind];patch({kind,enabled});return()=>patch({kind,enabled:previous});});}}/></>}><CoachNotificationPreview kind={kind} music={music}/></ReminderSettingRow>)}
 </ReminderSettingsList> {Object.entries(mutation.errors).filter(([,error])=>error).map(([kind,error])=><p key={kind} role="alert" className="pb-3 text-sm text-red-700">{COACH_NOTICE_LABELS[kind as CoachNoticeKind]}：{error}</p>)}<section className="rounded-xl border border-earth-200 bg-white p-4"><h2 className="mb-2 font-medium text-primary-800">{personnelText(courseDisplayText("教練／老師 LINE 綁定", music))}</h2><div className="grid gap-x-6 sm:grid-cols-2">{teachers.map(t=><div key={t.id} className="flex justify-between gap-3 border-b border-earth-100 py-2"><span>{t.name}</span><span className={t.bound?'text-primary-700':'text-earth-500'}>{t.bound?'已綁定':'尚未完成綁定'}</span></div>)}</div>{!teachers.length&&<p className="text-earth-500">尚無授課人員</p>}</section>
 <section className="rounded-xl border border-earth-200 bg-white p-4"><h2 className="mb-2 font-medium text-primary-800">{personnelText(courseDisplayText("近期教練通知", music))}</h2>{!logs.length?<p className="text-earth-500">尚無紀錄；開啟後只通知新事件。</p>:logs.map(log=><div key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-earth-100 py-2 last:border-0"><span className="text-sm text-earth-500">{log.time}</span><span>{log.name}</span><span>{COACH_NOTICE_LABELS[log.kind]}</span><span className="text-primary-700">{statuses[log.status]??log.status}</span>{log.reason&&<span className="text-sm text-earth-500">{log.reason}</span>}</div>)}</section></div>;
}
