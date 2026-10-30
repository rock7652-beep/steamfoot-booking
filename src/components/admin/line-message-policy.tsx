import {ReminderSettingRow,ReminderSettingsList} from "./reminder-settings-list";
import {formatTWDateTime} from '@/lib/date-utils';

/** Delivery and connection results, shared by every module; no independent shadow settings. */
export function LineMessagePolicy({preview,paused,resumeAt}:{preview:boolean;paused:boolean;resumeAt:string|null}){
 return <section aria-label="LINE 訊息發送狀態" className="min-w-0 overflow-hidden rounded-xl border border-earth-200 bg-white text-sm">
  <div role="status" className="border-b border-earth-100 px-4 py-3 text-earth-700">{preview?'隔離預覽不會發送 LINE。':paused?resumeAt?`LINE 通知預計於 ${formatTWDateTime(new Date(resumeAt))} 恢復。`:'LINE 通知目前暫停。':'LINE 通知依本店已開啟的項目發送；不補發停發期間的舊訊息。'}</div>
  <ReminderSettingsList label="綁定與回覆">
   <ReminderSettingRow title="加入好友歡迎訊息" control={<span className="rounded-md bg-earth-100 px-3 py-1 text-earth-600">不發送</span>}/>
   <ReminderSettingRow title="綁定成功／失敗提示" control={<span className="rounded-md bg-amber-50 px-3 py-1 text-amber-800">必要回覆</span>} action="預覽">
    <p className="mb-3 text-earth-600">顧客輸入手機後告知綁定結果；資料衝突時不變更原綁定。</p><div className="max-w-sm rounded-xl border border-earth-200 bg-white p-4 text-primary-900"><p className="font-semibold">LINE 綁定已完成。</p></div><p className="mt-3 text-earth-500">示意資料，不會發送。系統訊息使用 Flex 卡片。</p>
   </ReminderSettingRow>
  </ReminderSettingsList>
 </section>;
}

/** Connected settings rows; the existing authorized controls keep their behavior. */
export const lineMessageListClass='min-w-0 divide-y divide-earth-100';
