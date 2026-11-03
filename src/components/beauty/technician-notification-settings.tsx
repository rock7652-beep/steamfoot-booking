'use client';
import {ReminderSettingRow,ReminderSettingsList} from '@/components/admin/reminder-settings-list';
import {FlexNode} from '@/components/admin/coach-notification-preview';
import {technicianNoticeMessage} from '@/lib/beauty/technician-notifications';
import {useState} from 'react';
import {useSettingsPanelGuard} from '@/components/admin/settings-panel-context';
import {NotificationSwitch} from '@/components/admin/notification-switch';
import {setBeautyTechnicianNotification} from '@/server/actions/beauty-technician-notifications';
import {TECHNICIAN_NOTICE_KINDS,TECHNICIAN_NOTICE_LABELS,type TechnicianNoticeKind} from '@/lib/beauty/technician-notifications';
import {PERSONNEL_NEXT_DAY_REMINDER_TIME} from '@/lib/reminder-schedule';
export function TechnicianNotificationSettings({initial,readOnly,technicians}:{technicians:{id:string;name:string;linked:boolean}[];initial:Record<TechnicianNoticeKind,boolean>;readOnly:boolean}) {
 const [values,setValues]=useState(initial),[pending,setPending]=useState<TechnicianNoticeKind|null>(null),[errors,setErrors]=useState<Partial<Record<TechnicianNoticeKind,string>>>({});
 useSettingsPanelGuard(false,pending!==null);
 return <section className="min-w-0 space-y-3"><p className="text-sm text-earth-600">需啟用服務通知；技師須先連結本店會員並加入官方 LINE。</p><ReminderSettingsList label="技師通知">{TECHNICIAN_NOTICE_KINDS.map(kind=>{
 const message=technicianNoticeMessage('示範門市',kind,[{name:'王小美',service:'保養服務',startsAt:new Date('2026-10-31T01:00:00Z'),endsAt:new Date('2026-10-31T02:00:00Z'),location:'A 室'}],'https://example.invalid',kind==='TECH_CHANGE'?'預約時間已更新':undefined);
 const bubble=message.contents as Parameters<typeof FlexNode>[0]['node'];
 return <ReminderSettingRow key={kind} title={TECHNICIAN_NOTICE_LABELS[kind]} description={kind==='TECH_DIGEST'?`前一天 ${PERSONNEL_NEXT_DAY_REMINDER_TIME}（台灣時間）・僅本人有服務時發送`:'新增、改期、取消或恢復後通知相關技師'} action="預覽" pending={pending===kind} error={errors[kind]} control={<><span className="text-sm text-earth-500">{pending===kind?'儲存中…':values[kind]?'開啟':'關閉'}</span><NotificationSwitch aria-label={TECHNICIAN_NOTICE_LABELS[kind]} checked={values[kind]} disabled={readOnly||pending!==null} onChange={async e=>{const enabled=e.target.checked;setPending(kind);setErrors(current=>({...current,[kind]:''}));try{const r=await setBeautyTechnicianNotification({kind,enabled});if(r.success)setValues(v=>({...v,[kind]:enabled}));else setErrors(current=>({...current,[kind]:r.error}));}catch{setErrors(current=>({...current,[kind]:'設定結果未確認，請重新讀取後核對'}));}finally{setPending(null);}}}/></>}><p className="mb-3 text-sm text-earth-500">示意資料，與實際通知共用內容；預覽不發送。</p><div className="mx-auto max-w-[360px] rounded-2xl border border-earth-200 bg-white p-4"><FlexNode node={bubble}/></div></ReminderSettingRow>;
 })}</ReminderSettingsList><details className="rounded-xl border border-earth-200 bg-white px-4"><summary className="min-h-11 cursor-pointer py-3 text-primary-700">技師連結狀態</summary>{technicians.length?technicians.map(t=><div key={t.id} className="flex flex-wrap justify-between gap-2 border-t border-earth-100 py-2"><span>{t.name}</span><span className="text-sm text-earth-600">{t.linked?"已連結工作會員；LINE 送達狀態請查發送紀錄":"尚未連結工作會員，請至技師管理設定"}</span></div>):<p className="pb-3 text-sm text-earth-500">尚無技師</p>}</details></section>;
}
