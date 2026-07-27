# 待確認付款店長 LINE 通知入口盤點

## 目的

確認所有會新建立 `Transaction.paymentStatus = PENDING` 的正式業務入口，避免只接某一個畫面、漏通知或在確認／作廢時錯誤重複通知。

## 結論

目前正式建立「待確認付款」交易的入口共有兩個，皆位於：

`src/server/actions/wallet.ts`

### 1. 顧客前台線上購買

函式：`initiateCustomerPlanPurchase`

固定行為：

- `paymentMethod = TRANSFER`
- `paymentStatus = PENDING`
- `paidAt = null`
- 不先建立 wallet／堂數
- 顧客填寫 `transferLastFour`
- 成功後回傳新建的 `transactionId`

這是主要且必須通知店長的入口。

建議事件鍵：

`pending-payment:{transactionId}`

通知資料：

- storeId／storeSlug
- transactionId
- customerName
- planName
- amount
- transferLastFour
- 來源：顧客線上購買

### 2. 店長後台指派方案並選擇尚待確認

函式：`assignPlanToCustomer`

行為：

- `data.paymentStatus === PENDING` 時建立待確認交易
- 不先建立 wallet／堂數
- 已確認收款時為 `SUCCESS`，不可通知「待確認付款」
- `UNPAID` 必須維持待確認
- 成功後回傳新建的 `transactionId`

這是第二個必須通知店長的入口，但只在 `isPending === true` 時發送。

建議事件鍵：

`pending-payment:{transactionId}`

通知資料：

- storeId／storeSlug
- transactionId
- customerName
- planName
- amount
- bankLast5／referenceNo（若有）
- 來源：店長建立待確認方案

## 不屬於「新待確認付款」的入口

下列流程不應發送新待確認通知：

- `confirmTransactionPayment`：PENDING → CONFIRMED，是處理既有待辦
- `voidPendingTransaction`：PENDING → CANCELLED，是關閉既有待辦
- `collectTrialPayment`：現場收款，建立 SUCCESS
- `collectSinglePayment`：現場單次收款，建立 SUCCESS
- `createTransaction`：店長手動補登，不是顧客待確認流程
- `migratePaperPlanToWallet`：紙本轉入，建立 PAPER_MIGRATION / SUCCESS
- `refundTransaction`／`refundTransactionLegacy`：退款流程
- 預約本身為 `BookingStatus.PENDING`：這是預約狀態，不等於付款待確認

## 接入規則

兩個入口必須共用同一個 payment notification adapter：

1. 先完成 Prisma transaction 並取得新 `transactionId`
2. transaction 提交後才呼叫 LINE 通知
3. 通知失敗不得回滾交易或改成顧客送出失敗
4. 以 `transactionId` 作為穩定 event key
5. 同一交易只通知一次
6. SUCCESS／CONFIRMED 路徑不得呼叫
7. P2002 重複購買防護回傳既有錯誤時不得通知

## 後續實作範圍

建立 `pending-payment-manager-notification` adapter，並分別在：

- `initiateCustomerPlanPurchase` transaction 成功後
- `assignPlanToCustomer` 且 `isPending` transaction 成功後

呼叫同一 adapter。
