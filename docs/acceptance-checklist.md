# 最終驗收清單

> 最後更新：2026-04-06
> 適用版本：穩定模組 v1.2+
> 用途：每次 deploy 前 / 後快速驗收

---

## 1. 前台驗收（顧客端 `/(customer)/*`）

### 1-1 首頁 `/book`

- [ ] 登入後正確顯示歡迎訊息與顧客姓名
- [ ] 近 7 天內有預約時，顯示倒數提醒文字
- [ ] 有效課程方案摘要正確（剩餘堂數 = people-based 即時計算）
- [ ] 無預約時顯示空狀態引導（新增預約 CTA）
- [ ] 點「自助預約」可正確進入 `/book/new`

### 1-2 自助預約 `/book/new`

- [ ] 月曆正確顯示可選日期
- [ ] 方案下拉只顯示 `computedRemaining > 0` 的有效方案
- [ ] 剩餘堂數顯示 = `/my-plans` 的剩餘堂數（一致）
- [ ] 補課額度正確顯示（有 MakeupCredit 時）
- [ ] 選日期 → 選時段 → 選方案 → 送出，流程完整無錯誤
- [ ] 預約成功後跳轉至 `/my-bookings`
- [ ] selfBookingEnabled 關閉時，顯示「目前不開放自助預約」

### 1-3 我的預約 `/my-bookings`

- [ ] 「即將到來」tab 顯示 PENDING + CONFIRMED 預約，按日期升冪排序
- [ ] 「歷史紀錄」tab 顯示 COMPLETED + CANCELLED + NO_SHOW
- [ ] 各狀態 badge 顏色正確（黃=待確認、藍=已確認、綠=已完成、灰=已取消、紅=未到）
- [ ] PENDING / CONFIRMED 預約顯示「取消」按鈕
- [ ] COMPLETED / CANCELLED / NO_SHOW 不顯示取消按鈕
- [ ] 人數 > 1 時顯示人數 badge
- [ ] 補課預約顯示橙色「補課」標記

### 1-4 取消預約 `/my-bookings/[id]/cancel`

- [ ] 確認頁顯示預約詳情（日期、時段、方案）
- [ ] 確認取消後狀態變為 CANCELLED
- [ ] 取消後堂數正確歸還（剩餘堂數增加）
- [ ] 取消後跳轉回 `/my-bookings`

### 1-5 我的課程 `/my-plans`

- [ ] 顯示所有方案（ACTIVE、USED_UP、EXPIRED、CANCELLED）
- [ ] ACTIVE 方案顯示剩餘堂數（people-based 計算，非 DB `remainingSessions`）
- [ ] 堂數公式：`totalSessions - 已使用(COMPLETED+NO_SHOW) - 已預約(PENDING+CONFIRMED)`
- [ ] 補課預約（`isMakeup = true`）不計入扣堂
- [ ] 過期方案標記 EXPIRED
- [ ] 類別標籤正確（體驗 / 單次 / 課程）

### 1-6 個人資料 `/profile`

- [ ] 顯示並可編輯：姓名、電話、email、LINE 名稱、性別、生日、身高、地址、備註
- [ ] 生日日期選擇器預設值正確
- [ ] 修改密碼功能正常（需輸入舊密碼 + 新密碼）
- [ ] 儲存後資料正確更新

---

## 2. 後台驗收（Dashboard `/(dashboard)/dashboard/*`）

### 2-1 Dashboard 首頁

- [ ] 歡迎訊息顯示登入者姓名
- [ ] 今日日期顯示正確（台灣時間，含星期）
- [ ] 繁忙度標籤正確（清閒 / 正常 / 忙碌 / 爆滿）
- [ ] 今日預約筆數 = 時段表中 PENDING + CONFIRMED 的筆數
- [ ] 今日預約人數 = 時段表中 PENDING + CONFIRMED 的 SUM(people)
- [ ] 今日已完成 = COMPLETED 的 SUM(people) / 全部人數，進度條百分比正確
- [ ] 名下顧客數正確（Manager 只看自己名下）
- [ ] 【Owner 限定】本月營收 = 本月 REVENUE_TYPES 交易的 SUM(amount)
- [ ] 【Owner 限定】今日營收 = 今日 REVENUE_TYPES 交易的 SUM(amount)
- [ ] 【Manager】不顯示營收，改顯示有效顧客數
- [ ] 今日預約列表按 slotTime 升冪排序
- [ ] 各預約狀態左邊框顏色正確（黃/藍/綠/紅）
- [ ] 店長色點顯示正確
- [ ] 月曆總覽顯示當月各日預約數
- [ ] 快捷按鈕全部可正常導航

### 2-2 預約管理

- [ ] 月曆檢視：各日數字正確、點擊日期切換到日檢視
- [ ] 日檢視：顯示該日所有非取消預約，按時段排列
- [ ] 日檢視：前後日切換正常
- [ ] 新增預約：顧客搜尋功能正常（姓名/電話/email）
- [ ] 新增預約：日期選擇從今天起算 14 天
- [ ] 新增預約：8 個時段全部顯示（10:00、11:00、14:00、15:00、16:00、17:30、18:30、19:30）
- [ ] 預約詳情：顯示完整資訊（顧客、日期、時段、類型、狀態、方案、店長）
- [ ] 預約操作：報到（CONFIRMED）、完成（COMPLETED）、未到（NO_SHOW）、取消
- [ ] 完成預約後堂數正確扣除

### 2-3 顧客管理

- [ ] 列表：支援搜尋（姓名/電話/email）
- [ ] 列表：支援階段篩選（LEAD / TRIAL / ACTIVE / INACTIVE）
- [ ] 列表：支援店長篩選
- [ ] 列表：分頁正常
- [ ] 新增顧客：表單欄位完整、儲存成功
- [ ] 詳情頁：顯示顧客資料、方案列表、交易紀錄、預約紀錄
- [ ] 詳情頁：可更新顧客階段
- [ ] 詳情頁：可指派課程方案、建立預約、轉移歸屬

### 2-4 課程方案管理

- [ ] 列表：顯示所有方案，類別色標正確（紫=體驗、藍=單次、綠=課程）
- [ ] 列表：「全部 / 啟用中」切換正常
- [ ] 【Owner】可新增 / 編輯方案
- [ ] 【Manager】看不到新增按鈕、無法進入編輯頁
- [ ] 方案欄位：名稱、類別、價格、堂數、有效天數、說明、排序

### 2-5 交易紀錄

- [ ] 預設篩選為本月（dateFrom = 本月1日、dateTo = 今天）
- [ ] 篩選：日期範圍、交易類型、店長
- [ ] 篩選標籤顯示 + 可單獨移除 + 全部清除
- [ ] 本頁收入合計 = 本頁 REVENUE_TYPES 的 SUM(amount)
- [ ] 各交易類型 badge 顏色正確
- [ ] 負值金額（退款）顯示紅色
- [ ] 分頁正常

### 2-6 現金帳

- [ ] 預設月份 = 當月
- [ ] 月度統計：收入、支出+提領、淨額 正確
- [ ] 支援月份篩選、類型篩選
- [ ] 新增記帳：預設日期 = 今天（台灣時間）
- [ ] 新增記帳：欄位空白時不產生亂碼（已修復 P0-1）
- [ ] 編輯功能正常
- [ ] 分頁正常

### 2-7 店長管理（Owner 限定）

- [ ] Manager 訪問 `/dashboard/staff` → 404
- [ ] Manager 訪問 `/dashboard/staff/任意ID/edit` → 404
- [ ] 列表：顯示所有店長，含啟用/停用切換
- [ ] 啟用/停用切換即時生效（UI 更新、不需重整）
- [ ] 新增店長：表單完整（姓名、顯示名、email、電話、密碼、識別色、空間費）
- [ ] 編輯頁：可修改顯示名、識別色、空間費、空間費開關
- [ ] 權限設定：16 個權限碼全部可勾選 / 取消
- [ ] 權限儲存後立即生效

---

## 3. 報表與 CSV 驗收

### 3-1 報表頁 `/dashboard/reports`

- [ ] 日期 preset 切換正常（今日 / 本月 / 本季）
- [ ] 自訂日期範圍正常
- [ ] 課程總收入 = SUM(REVENUE_TYPES)
- [ ] 退款 = SUM(REFUND)（顯示絕對值、紅色）
- [ ] 淨收入 = 課程總收入 + 退款（退款為負數）
- [ ] 完成服務 = COUNT(COMPLETED bookings) 堂（筆數非人數）
- [ ] 店長明細：各店長淨收 = 個人課程收入 - 空間費
- [ ] 收入類型表：體驗 / 單次 / 課程 / 淨收 正確
- [ ] 無資料月份顯示「本期無資料」空狀態

### 3-2 CSV 匯出

- [ ] 全店月報 CSV：點擊下載成功、檔名含月份
- [ ] 全店月報 CSV：欄位完整（店長、體驗、單次、課程、補差額、退款、課程總收、空間費、淨收、完成堂數）
- [ ] 全店月報 CSV：合計列數字 = 各行加總
- [ ] 全店月報 CSV：現金帳區段（收入、支出+提領、淨額）
- [ ] 店長月報 CSV：點擊下載成功
- [ ] 店長月報 CSV：Manager 只匯出自己的資料
- [ ] 顧客資料 CSV：匯出所有欄位正確
- [ ] 所有 CSV 檔案以 UTF-8 BOM 開頭（Excel 中文不亂碼）

### 3-3 報表數字一致性

- [ ] 報表頁「課程總收入」 = 交易紀錄篩選同月 REVENUE_TYPES 的 SUM
- [ ] 報表頁「退款」 = 交易紀錄篩選同月 REFUND 的 SUM
- [ ] 報表頁「完成服務」= 預約管理篩選同月 COMPLETED 的 COUNT
- [ ] CSV 匯出數字 = 報表頁面數字（完全一致）
- [ ] Manager 報表數字 = 該 Manager 的交易紀錄數字

---

## 4. 前後台資料一致性驗收

### 4-1 堂數一致性（最關鍵）

- [ ] 前台 `/my-plans` 剩餘堂數 = 後台顧客詳情的堂數
- [ ] 前台 `/book` 首頁剩餘堂 = `/my-plans` 摘要
- [ ] 前台 `/book/new` 方案選擇的剩餘堂 = `/my-plans` 顯示
- [ ] 公式：`totalSessions - SUM(COMPLETED+NO_SHOW peoples) - SUM(PENDING+CONFIRMED peoples)`
- [ ] 補課預約（`isMakeup = true`）不計入扣堂
- [ ] 人數 > 1 的預約正確扣多堂

### 4-2 預約狀態一致性

- [ ] 前台 `/my-bookings` 狀態 badge = 後台預約詳情的狀態
- [ ] 後台標記完成 → 前台即時反映為「已完成」
- [ ] 後台標記未到 → 前台即時反映為「未到」（仍扣堂）
- [ ] 前台取消 → 後台即時反映為「已取消」
- [ ] CANCELLED 不出現在任何統計中

### 4-3 營收一致性

- [ ] Dashboard 今日營收 = 交易紀錄頁篩選今日的購買類加總
- [ ] Dashboard 本月營收 = 交易紀錄頁篩選本月的購買類加總
- [ ] 報表淨收 = Dashboard 或交易頁可推算的相同數字

### 4-4 顧客資料一致性

- [ ] 前台 `/profile` 顯示的資料 = 後台顧客詳情的資料
- [ ] 前台修改姓名 / 電話 → 後台即時看到更新
- [ ] 後台修改顧客階段 → 前台功能對應變化

---

## 5. 權限驗收

### 5-1 Layout 層級

- [ ] 未登入 → 重導至 `/login`
- [ ] CUSTOMER 登入後訪問 `/dashboard` → 重導至 `/book`
- [ ] OWNER / MANAGER → 正常進入 Dashboard

### 5-2 Owner 完整權限

- [ ] Owner 可存取所有 dashboard 頁面
- [ ] Owner 可操作所有功能（新增/編輯/刪除/匯出）
- [ ] Owner 可看到所有營收數據

### 5-3 Manager 動態權限

以下每項需用一個「僅有基本權限」的 Manager 帳號測試：

- [ ] 無 `customer.read` → 訪問 `/dashboard/customers` 被重導至 `/dashboard`
- [ ] 無 `customer.create` → 訪問 `/dashboard/customers/new` 被重導
- [ ] 無 `booking.read` → 訪問 `/dashboard/bookings` 被重導
- [ ] 無 `booking.create` → 訪問 `/dashboard/bookings/new` 被重導
- [ ] 無 `transaction.read` → 訪問 `/dashboard/transactions` 被重導
- [ ] 無 `cashbook.read` → 訪問 `/dashboard/cashbook` 被重導
- [ ] 無 `cashbook.create` → 訪問 `/dashboard/cashbook/new` 被重導
- [ ] 無 `wallet.read` → 訪問 `/dashboard/plans` 被重導
- [ ] 無 `wallet.create` → 訪問 `/dashboard/plans/new` 被重導
- [ ] 無 `report.read` → 訪問 `/dashboard/reports` 被重導
- [ ] 任何 Manager → 訪問 `/dashboard/staff` → 404
- [ ] 任何 Manager → 訪問 `/dashboard/staff/任意ID/edit` → 404

### 5-4 Manager 資料隔離

- [ ] 交易紀錄：Manager 只看到自己 `revenueStaffId` 的交易
- [ ] 現金帳：Manager 只看到自己 `staffId` 的記帳
- [ ] 報表：Manager 只看到自己的營收數據
- [ ] CSV 匯出：Manager 只匯出自己的資料
- [ ] Dashboard KPI：Manager 只統計自己名下顧客的預約

### 5-5 Sidebar 導航

- [ ] 無權限的功能不在 sidebar 顯示
- [ ] 有權限的功能正確顯示
- [ ] Owner 看到「店長管理」入口
- [ ] Manager 看不到「店長管理」入口

### 5-6 後端防護（防繞過 UI）

- [ ] 直接 POST server action（無 UI） → `requirePermission()` 擋下
- [ ] 直接 GET CSV 匯出 API（無權限） → 403 Forbidden

---

## 6. 日期與時區驗收

### 6-1 UTC+8 正確性

> 關鍵測試時段：**台灣時間 00:00 ~ 08:00**（= UTC 16:00 ~ 24:00）
> 在此時段 `new Date().toISOString().slice(0,10)` 會回傳昨天，是最容易出錯的區間

- [ ] Dashboard 首頁：「今天」日期顯示正確（非 UTC 的昨天）
- [ ] Dashboard 首頁：今日預約列表 = 台灣日期的預約（非 UTC 日期）
- [ ] 交易紀錄頁：預設 dateFrom 本月1日、dateTo 今天 → 日期正確
- [ ] 現金帳頁：預設月份 = 台灣時間的當月
- [ ] 現金帳新增：預設日期 = 台灣時間的今天
- [ ] 新增預約頁：日期列表從台灣時間的今天開始
- [ ] 報表頁：月份預設 = 台灣時間的當月
- [ ] CSV 匯出：預設月份 = 台灣時間的當月
- [ ] CSV 匯出：檔名日期正確
- [ ] 報表數據：月份邊界正確（4月報表包含台灣 4/1 00:00 ~ 4/30 23:59 的資料）

### 6-2 日期欄位儲存與讀取

- [ ] `bookingDate` 儲存為 `T00:00:00.000Z`，顯示為正確的台灣日期
- [ ] `entryDate`（現金帳）同上
- [ ] `birthday` 同上
- [ ] `createdAt` 查詢使用 UTC+8 偏移邊界

### 6-3 共用工具使用

- [ ] 全程式碼無殘留 `new Date().toISOString().slice(0, 10)` 用於「今天」判斷
- [ ] 全程式碼無殘留 inline `TZ_OFFSET` 自行計算時區
- [ ] 所有 server-side 日期邏輯統一使用 `src/lib/date-utils.ts`

---

## 快速冒煙測試（每次 deploy 最少跑這些）

> 以下為最小驗收集，約 10 分鐘可完成

### Owner 帳號

- [ ] 登入 → Dashboard 首頁 KPI 數字合理
- [ ] 新增預約 → 選顧客 → 選日期時段 → 成功
- [ ] 預約詳情 → 標記完成 → 堂數正確扣除
- [ ] 報表頁 → 本月數字 ≥ 0、淨收入公式正確
- [ ] 全店月報 CSV → 下載成功、數字 = 報表頁
- [ ] 現金帳 → 新增一筆 → 列表顯示正確

### Manager 帳號

- [ ] 登入 → Dashboard 不顯示營收
- [ ] 訪問 `/dashboard/staff` → 404
- [ ] 只看到自己的交易紀錄

### Customer 帳號

- [ ] 登入 → `/book` 首頁顯示正常
- [ ] `/my-plans` 剩餘堂數與 `/book/new` 一致
- [ ] 自助預約 → 完成 → `/my-bookings` 出現新預約
- [ ] 取消預約 → 堂數歸還

### 時區測試

- [ ] 若可在台灣凌晨 00:00~08:00 測試：Dashboard 日期、報表月份、現金帳預設全部正確

---

## 附錄：指標計算公式速查

| 指標 | 公式 | 排除 |
|------|------|------|
| 剩餘堂數 | `totalSessions - SUM(COMPLETED+NO_SHOW peoples) - SUM(PENDING+CONFIRMED peoples)` | `isMakeup=true`, `CANCELLED` |
| 今日預約筆數 | `COUNT(id) WHERE today AND (PENDING\|CONFIRMED)` | COMPLETED, NO_SHOW, CANCELLED |
| 今日預約人數 | `SUM(people) WHERE today AND (PENDING\|CONFIRMED)` | 同上 |
| 今日已完成 | `SUM(people) WHERE today AND COMPLETED` | — |
| 今日營收 | `SUM(amount) WHERE today AND REVENUE_TYPES` | REFUND, SESSION_DEDUCTION, ADJUSTMENT |
| 本月營收 | `SUM(amount) WHERE monthStart AND REVENUE_TYPES` | 同上 |
| 淨收入 | `課程總收入 + 退款`（退款為負數） | SESSION_DEDUCTION, ADJUSTMENT |
| 完成堂數(報表) | `COUNT(booking.id) WHERE COMPLETED`（筆數非人數） | CANCELLED |
| REVENUE_TYPES | `TRIAL_PURCHASE, SINGLE_PURCHASE, PACKAGE_PURCHASE, SUPPLEMENT` | — |
