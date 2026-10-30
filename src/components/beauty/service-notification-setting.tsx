'use client';
import {ReminderSettingRow} from '@/components/admin/reminder-settings-list';
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
 return <ReminderSettingRow title="本店 LINE 通知" description="服務通知共用開關，涵蓋顧客、店長與技師；各項仍依自己的設定發送。關閉不影響小鈴噹。" pending={pending} error={error} action="查看範圍" control={<><span className="text-sm text-earth-500">{pending?'儲存中…':enabled?'開啟':'關閉'}</span><NotificationSwitch aria-label="本店 LINE 通知開關" checked={enabled} disabled={readOnly||pending} onChange={e=>void save(e.target.checked)}/></>}><p className="text-sm leading-relaxed text-earth-600">服務預約通知沿用同一組設定，不提供分項開關。明日預約提醒於前一天 18:00（台灣時間）發送；店長與技師的個別通知請至對應分頁設定。</p></ReminderSettingRow>;
}
