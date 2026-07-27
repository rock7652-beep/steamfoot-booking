# 店長 LINE 主動通知

對應 Issue #574。

## 產品原則

店長不需要主動登入後台巡檢。只要發生會影響成交或金流的事件，蒸管家就應主動通知；沒有通知，才代表沒有需要店長處理的事情。

## 第一版事件

1. Digital Butler 完成姓名／手機收集並建立 Lead
2. 公開快速體驗預約建立 FIRST_TRIAL Booking
3. 顧客送出轉帳資訊，進入待確認付款

第一版不做 Email、App Push、每日摘要、AI 分析、多收件人或多層升級通知。

## 第一階段設定

每店先設定一位主要店長 LINE 收件者，以 Vercel server-side environment variable 保存：

- 竹北：`LINE_MANAGER_USER_ID_ZHUBEI`
- 台中：`LINE_MANAGER_USER_ID_TAICHUNG`
- 新竹：`LINE_MANAGER_USER_ID_HSINCHU`

值必須是店長加入該店 LINE 官方帳號後，由該店 Messaging API webhook 驗證取得的 LINE user ID。不得填入顧客的 `Customer.lineUserId`，也不得把中央 LINE Login 身分誤當成分店官方帳號收件身分。

## 共用服務

`src/server/services/store-manager-line-notifications.ts`

負責：

- 解析 store-scoped 店長收件者
- 統一三種通知文案
- 使用預約店別的 LINE Messaging API channel 發送
- 產生可直接處理的後台 deep link
- 發送失敗時只記錄錯誤並回傳失敗結果，不拋回顧客流程

主要資料必須先完成寫入，再呼叫通知服務。通知失敗不可回滾 Lead、Booking 或付款資料。

## 防重複

事件接入時必須提供穩定 `eventKey`：

- Lead：`digital-butler-lead:{leadId}`
- Booking：`public-trial-booking:{bookingId}`
- Payment：`pending-payment:{paymentId}`

第一階段先建立事件合約；持久化 idempotency／發送紀錄會在接入事件前完成，避免 Vercel retry、webhook redelivery 或使用者重複點擊造成重複通知。

## 後續拆分

- PR 1：共用通知服務、店長收件者設定方式與訊息合約
- PR 2：持久化 idempotency／發送紀錄，接入公開預約與待確認付款
- PR 3：接入 Digital Butler Lead，完成全流程 targeted tests
