# 公開快速體驗預約

## 目的

讓第一次接觸暖暖蒸足的顧客，不需註冊會員、不需設定密碼，也能完成首次體驗預約。

## 顧客流程

1. 選擇日期
2. 選擇可預約時段
3. 填寫姓名
4. 填寫手機
5. 點擊「立即預約 NT$499 體驗」
6. 顯示預約成功資訊

## 顧客必填欄位

- bookingDate
- slotTime
- name
- phone

不收集：密碼、確認密碼、性別、生日、LINE 綁定、健康資料。

## 建立結果

- 同店以標準化手機號碼尋找既有 Customer
- 找不到才建立 Customer，customerStage=LEAD，selfBookingEnabled=false
- 建立 Booking.bookingType=FIRST_TRIAL
- bookingStatus=PENDING
- expectedAmount=店別體驗設定，竹北目前 NT$499
- 不建立 Transaction
- 不建立 CustomerPlanWallet
- 不扣正式方案堂數

## 安全邊界

- 公開入口只接受 storeSlug，不接受 storeId/customerId/servicePlanId/expectedAmount
- storeSlug 必須解析為啟用中的店別
- 金額由 server 的 trial settings 決定
- servicePlanId 由 ensureTrialPlan 決定
- 手機必須正規化為台灣行動電話格式
- 同一店別、同一手機若已有 PENDING/CONFIRMED FIRST_TRIAL，回傳既有預約，不建立第二筆
- 同一店別、同一手機若已有 COMPLETED FIRST_TRIAL，拒絕再次使用首次體驗價
- CANCELLED/NO_SHOW 可再次預約
- 沿用營業日、公休、進修日、時段開關、容量、預約開放日期、店別訂閱狀態檢查
- 需有 idempotency request key，避免重複點擊
- 公開 action 不得呼叫需要員工或會員 session 的 action
- 核心驗證應抽成 server-only service，員工、LIFF、公開預約共用

## 防濫用

第一版至少加入：

- server-side request key
- 同店同手機重複體驗限制
- 同一 IP/手機的短時間頻率限制（若現有 rate-limit service 可直接沿用）
- 不在錯誤訊息中洩漏顧客完整資料

## UI 驗收

- 體驗頁 CTA 直接進入 `/pricing/experience/zhubei/book`
- 不再導向 `/s/zhubei/register`
- 預約頁順序：日期、時段、姓名、手機
- 四個欄位都完成後才可送出
- 手機錯誤顯示白話提示
- 成功畫面顯示店名、日期、時間、NT$499、約45分鐘
- 可選擇加入官方 LINE，但不是必要條件

## 後台驗收

店長可在既有體驗預約列表看到：

- 顧客姓名
- 手機
- 日期與時段
- FIRST_TRIAL
- 待收款
- 預期金額 NT$499

後續收款與完成服務沿用既有 collectTrialPayment 流程。

## 不在本 PR

- 簡訊 OTP
- 線上付款
- 取消與改約自助頁
- 正式會員帳號建立
- LINE 強制綁定
