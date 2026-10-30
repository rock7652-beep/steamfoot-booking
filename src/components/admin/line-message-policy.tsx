import {formatTWDateTime} from '@/lib/date-utils';

/** Delivery and connection results, shared by every module; no independent shadow settings. */
export function LineMessagePolicy({preview,paused,resumeAt}:{preview:boolean;paused:boolean;resumeAt:string|null}){
 return <section aria-label="LINE 訊息發送狀態" className="min-w-0 overflow-hidden rounded-xl border border-earth-200 bg-white text-sm">
  <div role="status" className="border-b border-earth-100 px-4 py-3 text-earth-700">{preview?'隔離預覽不會發送 LINE。':paused?resumeAt?`LINE 通知預計於 ${formatTWDateTime(new Date(resumeAt))} 恢復。`:'LINE 通知目前暫停。':'LINE 通知依本店已開啟的項目發送；不補發停發期間的舊訊息。'}</div>
  <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-earth-100 px-4 py-3"><span className="font-semibold">加入好友歡迎訊息</span><span className="text-earth-500">不發送</span></div>
  <details className="group">
   <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3"><span className="font-semibold">綁定成功／失敗提示</span><span className="text-primary-700">必要回覆・查看 Flex 預覽</span></summary>
   <div className="space-y-3 border-t border-earth-100 bg-earth-50 p-4"><p className="text-earth-600">顧客輸入手機後，系統會告知綁定結果；資料衝突時不變更原綁定。</p><div className="max-w-sm rounded-xl border border-earth-200 bg-white p-4 text-primary-900"><p className="font-semibold">LINE 綁定已完成。</p></div><p className="text-earth-500">卡片示意，不會發送。所有系統訊息統一使用 Flex 卡片。</p></div>
  </details>
 </section>;
}

/** Connected settings rows; the existing authorized controls keep their behavior. */
export const lineMessageListClass='min-w-0 overflow-hidden rounded-xl border border-earth-200 bg-white divide-y divide-earth-100 [&>details]:rounded-none [&>details]:border-0 [&>details]:shadow-none [&>section]:rounded-none [&>section]:border-0 [&>section]:shadow-none';
