'use client';
import {useState} from 'react';
import {NotificationSwitch} from '@/components/admin/notification-switch';
import {saveBeautyOperationSwitch} from '@/server/actions/beauty-settings-patch';
import {useSettingsPanelGuard} from '@/components/admin/settings-panel-context';

export function BeautyServiceNotificationSetting({storeId,initialEnabled,readOnly}:{storeId:string;initialEnabled:boolean;readOnly:boolean}){
 const [enabled,setEnabled]=useState(initialEnabled),[pending,setPending]=useState(false),[error,setError]=useState('');
 useSettingsPanelGuard(false,pending);
 async function save(next:boolean){
  if(pending)return;
  setPending(true);setError('');
  try{const result=await saveBeautyOperationSwitch({storeId,key:'notifications',enabled:next,previous:enabled});if(!result.success){setError(result.error);return;}setEnabled(result.data.enabled);}catch{setError('儲存結果尚未確認，請重新整理後核對。');}finally{setPending(false);}
 }
 return <section className="min-w-0 border-b border-earth-100 py-3">
  <label className="flex min-h-11 flex-wrap items-center justify-between gap-3"><span className="font-semibold text-primary-900">本店 LINE 通知・{pending?'儲存中…':enabled?'開啟':'關閉'}</span><NotificationSwitch aria-label="本店 LINE 通知開關" checked={enabled} disabled={readOnly||pending} onChange={e=>void save(e.target.checked)}/></label>
  <p className="text-sm text-earth-600">依各項設定通知顧客、店長與技師；明日預約提醒於前一天 18:00 發送。關閉 LINE 不影響小鈴噹。</p>
  {error&&<p role="alert" className="mt-2 break-words text-sm text-red-700">{error}</p>}
 </section>;
}
