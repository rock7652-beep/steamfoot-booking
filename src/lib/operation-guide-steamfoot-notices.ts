import type {OperationGuide} from "./operation-guide-types";
export const steamfootNoticeGuides:OperationGuide[]=[{
 id:"A17",category:"booking",title:"蒸足後台異動通知在哪裡？如何標記已處理？",
 summary:"從頂欄小鈴噹查看門市異動與數位管家待辦；處理通知不修改原業務資料。",
 answer:"點右上角門市通知鈴鐺，查看待處理異動；確認後點 ○ 標記已處理。查看預約不會自動標記，也不改收款或預約狀態。",
 path:"後台右上角 → 門市通知",
 keywords:"蒸足 後台異動通知 門市通知 鈴鐺 預約 取消 改期 修改 未到 恢復 完成服務 待處理 已處理 提示音 預設開啟",
 steps:["點右上角鈴鐺查看待處理數量；展開一列核對姓名、時間、服務及值班人員。","需要核對時選「查看預約」，關閉預約明細後返回原通知；確認後點 ○ 標記已處理。","到已處理頁籤可查看處理人，點 O 恢復待處理；剛完成的操作也可點「復原」。","小鈴噹持續接收門市通知；提示音預設開啟，可在鈴鐺內右上角調整，並保留此裝置的選擇。"],
 important:"小鈴噹與 LINE 獨立，不會替任何學員點名；處理通知不等於付款、完成服務或解決客服，仍需進原資料核對。",
 success:"通知狀態符合目前門市的處理結果，關閉通知或明細後原工作頁與草稿仍保留。",
 details:[
  "小鈴噹持續接收門市數位管家待辦，不受個人 LINE 通知開關影響；提示音仍是本裝置設定。待確認付款、服務未完成、真人客服催辦與每日待辦在此集中查看。",
  "通知為同店共用；一人標記後，其他同店人員下次更新會看到一致狀態，約每分鐘或切回視窗時更新。",
  "查看通知需要預約檢視權限；標記需要預約修改權限；更改開關需要營業與預約設定權限。子店唯讀視角不能標記或儲存。",
  "通知只從功能啟用後的新操作開始記錄；同一預約保留一筆最新異動，連續改期保留最初時間；提示音與既有 LINE 通知分開設定。瀏覽器需先點擊或操作頁面才能播放；第一次載入既有通知不響鈴。"
],
 modules:["steamfoot"],permission:"booking.read",feature:null,kind:"howto",verification:"source-reviewed",
 sources:["src/components/admin/steamfoot-store-notice-bell.tsx","src/components/admin/store-notice-bell.tsx","src/components/admin/steamfoot-notice-setting.tsx","src/server/actions/steamfoot-store-notices.ts","prisma/migrations/20261021040000_steamfoot_store_notices/migration.sql"]
}];
