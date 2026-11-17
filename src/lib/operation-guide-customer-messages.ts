import type {OperationGuide} from "./operation-guide-types";
export const customerMessagesGuide:OperationGuide={
  id:"LINE-MANUAL-01",category:"care",title:"如何自行編寫訊息，篩選顧客並安排 LINE 發送？",
  summary:"選顧客、寫內容、選發送時間、預覽確認，再發送。",
  answer:"從顧客管理點「發送訊息」，先選收件人或帶入已勾選名單，再自由編寫文字。核對收件人與時間後確認，並在「發送紀錄」查看結果。",
  path:"後台 → 顧客管理 → 發送訊息／發送紀錄",
  keywords:"自由訊息 自訂內容 顧客篩選 批次群發 LINE 排程 指定時間 取消發送 未綁定 未送達",
  steps:[
    "在顧客管理勾選顧客，點右上角「發送訊息」帶入名單；單一顧客可從詳情點「發送 LINE」。也可進入發送畫面後，再以姓名、電話或 LINE 名稱搜尋，或展開顧客階段、LINE 狀態、標籤與負責人篩選，每次最多 500 位。",
    "輸入想傳給顧客的文字，最多 2,000 字。返回上一步仍保留已選顧客與內容。",
    "選立即發送，或指定未來 90 天內的日期與時間，時間均為台灣時間。",
    "在預覽核對「傳給誰」「何時發送」「訊息內容」及預估 LINE 用量；不會發送的顧客會列出原因，預覽本身不會發送。",
    "在顧客管理右上角點「發送紀錄」直接查看結果；發送完成後也會展開紀錄。尚未開始發送的訊息可取消；若結果待確認，核對同一筆訊息，避免另建一筆重複發送。",
  ],
  important:"本功能使用本店 LINE 主動訊息，依 LINE 計費。LINE 已接受不代表顧客已收到或已讀；系統停發、預覽隔離、管道、身分、權限、方案及額度限制仍會阻擋發送。",
  details:["顧客名單在確認時固定，後續新增的顧客不會自動加入；到時會重新核對身分，身分變更不改寄其他人或中央帳號。","排程會依序處理，可能稍有延遲。取消不會撤回 LINE 已接受或正在處理的請求。","老闆可在本店權限範圍使用；其他人員需查看顧客與發送顧客訊息權限，並且本店已開通 LINE 通知。既有自訂人員權限不會自動擴權。"],
  success:"已建立發送或排程，紀錄可辨識等待處理、LINE 已接受、未發送及結果待確認。",
  modules:["steamfoot","course","beauty"],permission:"customer.message.send",additionalPermissions:["customer.read"],feature:"line_reminder",kind:"howto",verification:"source-reviewed",
  sources:["src/app/(dashboard)/dashboard/customers/messages/composer.tsx","src/server/actions/customer-messages.ts","src/server/services/customer-message-worker.ts"],
};
