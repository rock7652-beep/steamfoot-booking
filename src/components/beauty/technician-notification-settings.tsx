'use client';
import {useState} from 'react';
import {useSettingsPanelGuard} from '@/components/admin/settings-panel-context';
import {NotificationSwitch} from '@/components/admin/notification-switch';
import {setBeautyTechnicianNotification} from '@/server/actions/beauty-technician-notifications';
import {TECHNICIAN_NOTICE_KINDS,TECHNICIAN_NOTICE_LABELS,type TechnicianNoticeKind} from '@/lib/beauty/technician-notifications';
import {PERSONNEL_NEXT_DAY_REMINDER_TIME} from '@/lib/reminder-schedule';
export function TechnicianNotificationSettings({initial,readOnly,technicians}:{technicians:{id:string;name:string;linked:boolean}[];initial:Record<TechnicianNoticeKind,boolean>;readOnly:boolean}) {
 const [values,setValues]=useState(initial),[pending,setPending]=useState<TechnicianNoticeKind|null>(null),[error,setError]=useState('');
 useSettingsPanelGuard(false,pending!==null);
 return <section className="min-w-0 border-t border-earth-200 py-3"><h2 className="font-medium text-primary-800">技師通知</h2><p className="text-sm text-earth-600">需啟用服務通知；技師須先連結本店會員並加入官方 LINE。</p>{TECHNICIAN_NOTICE_KINDS.map(kind=><div key={kind} className="flex min-w-0 items-center justify-between gap-3 py-3"><div className="min-w-0"><p>{TECHNICIAN_NOTICE_LABELS[kind]}</p><p className="text-sm text-earth-600">{kind==='TECH_DIGEST'?`前一天 ${PERSONNEL_NEXT_DAY_REMINDER_TIME}（台灣時間）・僅本人有服務時發送`:'新增、改期、取消或恢復後通知相關技師'}</p></div><NotificationSwitch aria-label={TECHNICIAN_NOTICE_LABELS[kind]} checked={values[kind]} disabled={readOnly||pending!==null} onChange={async e=>{const enabled=e.target.checked;setPending(kind);setError('');try{const r=await setBeautyTechnicianNotification({kind,enabled});if(r.success)setValues(v=>({...v,[kind]:enabled}));else setError(r.error);}catch{setError('設定結果未確認，請重新讀取後核對');}finally{setPending(null);}}}/></div>)}{technicians.map(t=><div key={t.id} className="flex flex-wrap justify-between gap-2 border-t border-earth-100 py-2"><span>{t.name}</span><span className="text-sm text-earth-600">{t.linked?"已連結工作會員；LINE 送達狀態請查發送紀錄":"尚未連結工作會員，請至技師管理設定"}</span></div>)}{pending&&<p role="status">儲存中…</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</section>;
}
