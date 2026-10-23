'use client';
import { useKeyedReminderMutation } from "../../reminders/reminder-setting-feedback";
import { courseDisplayText } from "@/lib/course-display-text";
import {NotificationSwitch} from '@/components/admin/notification-switch';
import {CoachNotificationPreview} from '@/components/admin/coach-notification-preview';
import {useSettingsPanelGuard} from '@/components/admin/settings-panel-context';
import { useState,useOptimistic } from 'react';
import { toast } from 'sonner';
import { setCoachNotification } from '@/server/actions/course-coach-notifications';
import { COACH_NOTICE_KINDS,COACH_NOTICE_LABELS,type CoachNoticeKind } from '@/lib/course-coach-notifications';
export function CoachNotificationSettings({initial,teachers,logs,music=false}:{music?:boolean;initial:Record<CoachNoticeKind,boolean>;teachers:{id:string;name:string;bound:boolean}[];logs:{id:string;name:string;kind:CoachNoticeKind;status:string;reason:string;time:string}[]}) {
 const [settings,setSettings]=useState(initial);
 const [display,patch]=useOptimistic(settings,(current,change:{kind:CoachNoticeKind;enabled:boolean})=>({...current,[change.kind]:change.enabled}));
 const mutation=useKeyedReminderMutation();
 const pending=mutation.pending;
 const [preview,setPreview]=useState<CoachNoticeKind|null>(null);
 useSettingsPanelGuard(false,pending);
 const descriptions={DIGEST:'每日 21:00 · 只通知本人明日課程',CHANGE:'調課、停課、取消與代課',TRIAL:'新增體驗學員及已通知資料異動'};
 const statuses:Record<string,string>={READY:'待發送',PENDING:'處理中',SENT:'已發送',SKIPPED:'已跳過',FAILED:'待重試',BLOCKED:'需確認'};
 return <div className="space-y-4"><section className="rounded-xl border border-earth-200 bg-white px-4">
 {COACH_NOTICE_KINDS.map(kind=><div key={kind} className="border-b border-earth-100 py-3 last:border-0"><div className="flex items-center justify-between gap-4"><span><span className="font-medium text-primary-800">{COACH_NOTICE_LABELS[kind]}</span><span className="ml-3 text-sm text-earth-500">{descriptions[kind]}</span></span><div className="flex items-center gap-3"><button type="button" className="min-h-11 text-sm text-primary-700" aria-expanded={preview===kind} onClick={()=>setPreview(preview===kind?null:kind)}>{preview===kind?"收合":"預覽"}</button>{mutation.isPending(kind)&&<span role="status" className="text-sm text-earth-500">儲存中…</span>}<NotificationSwitch aria-label={COACH_NOTICE_LABELS[kind]} checked={display[kind]} disabled={mutation.isPending(kind)} aria-busy={mutation.isPending(kind)} onChange={e=>{const enabled=e.target.checked;void mutation.run(kind,()=>setCoachNotification({kind,enabled}),()=>{setSettings(s=>({...s,[kind]:enabled}));toast.success('通知設定已儲存');},()=>{const previous=display[kind];patch({kind,enabled});return()=>patch({kind,enabled:previous});});}}/></div></div>{preview===kind&&<CoachNotificationPreview kind={kind} music={music}/>}</div>)}
 {Object.entries(mutation.errors).filter(([,error])=>error).map(([kind,error])=><p key={kind} role="alert" className="pb-3 text-sm text-red-700">{COACH_NOTICE_LABELS[kind as CoachNoticeKind]}：{error}</p>)}</section><section className="rounded-xl border border-earth-200 bg-white p-4"><h2 className="mb-2 font-medium text-primary-800">{courseDisplayText("教練／老師 LINE 綁定", music)}</h2><div className="grid gap-x-6 sm:grid-cols-2">{teachers.map(t=><div key={t.id} className="flex justify-between gap-3 border-b border-earth-100 py-2"><span>{t.name}</span><span className={t.bound?'text-primary-700':'text-earth-500'}>{t.bound?'已綁定':'尚未完成綁定'}</span></div>)}</div>{!teachers.length&&<p className="text-earth-500">尚無授課人員</p>}</section>
 <section className="rounded-xl border border-earth-200 bg-white p-4"><h2 className="mb-2 font-medium text-primary-800">{courseDisplayText("近期教練通知", music)}</h2>{!logs.length?<p className="text-earth-500">尚無紀錄；開啟後只通知新事件。</p>:logs.map(log=><div key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-earth-100 py-2 last:border-0"><span className="text-sm text-earth-500">{log.time}</span><span>{log.name}</span><span>{COACH_NOTICE_LABELS[log.kind]}</span><span className="text-primary-700">{statuses[log.status]??log.status}</span>{log.reason&&<span className="text-sm text-earth-500">{log.reason}</span>}</div>)}</section></div>;
}
