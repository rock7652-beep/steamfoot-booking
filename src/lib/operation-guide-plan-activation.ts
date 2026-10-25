import type { OperationGuide } from "./operation-guide-types";
export const planActivationGuides:OperationGuide[]=[{
  id:"PLAN_ACTIVATION",category:"care",title:"購買或續購方案後，如何自動以 LINE 通知顧客？",
  summary:"在顧客提醒開啟「方案開通通知」，於方案實際開通後通知購買人。",
  answer:"預設關閉；已付款並開通的新購／續購會通知購買人，待核帳訂單需等核帳開通，不補發歷史購買。",
  keywords:"學員 購買成功 續購 開卡 開通 LINE 通知 開關 核帳 方案提醒",
  path:"設定 → 提醒管理 → 顧客提醒 → 方案提醒／方案開通通知",
  steps:["開啟提醒管理並切至顧客提醒。蒸足與運動／音樂選擇「方案提醒」；美業在方案提醒區找到「方案開通通知」。","開啟方案開通通知，等待儲存完成；需要時展開訊息預覽。","購買或核帳開通後，到發送紀錄篩選「方案開通通知」，核對購買人與結果。"],
  important:"只通知購買人，共用成員不另外發送；LINE 需已確認且可接收，並有店家功能與提醒額度。",
  success:"開通事件有對應發送紀錄；SENT 表示 LINE 已接受，仍須在收件端確認。",
  details:["通知顯示門市、方案名稱、本次開通額度與期限；音樂首堂起算方案會顯示起算天數，不宣稱已繳清全部學費。","僅新購或續購實際開通會建立通知；歷史匯入、紙本移轉、手動補額度及補登收款不另發開通通知。","停用期間開通的方案不補發；退款、作廢、結清或 LINE 身分改變時會重新判斷並略過。已交給 LINE 的請求無法撤回。","暫時失敗每五分鐘重試，沿用同筆事件避免重複；超過安全期限或次數停止補送。隔離預覽與美業全域發送關閉時不實際傳送。"],
  modules:["steamfoot","course","beauty"],permission:"business_hours.manage",feature:"line_reminder",kind:"howto",verification:"source-reviewed",
  sources:["src/components/admin/plan-activation-notification-setting.tsx","src/server/services/plan-activation-enqueue.ts","src/server/services/plan-activation-notifications.ts"],
}];
