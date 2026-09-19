# 課程承接共用功能：模組隔離與回歸核對

## 範圍與版本

2026-09-18 約 15:20–15:30（Asia/Taipei），PR #1022，功能版本 `6ba449db4db91ab8fc13a09e96d5804484204c66`。隔離部署 `dpl_3XirfkniZ2vgtX5ybktgXW5ieHMi`。僅查詢 steamfoot-preview、操作隔離預覽；本次沒有資料寫入、遷移、正式部署或通知外發。

本文件補充既有新店實測與承接對照，不取代交易驗收紀錄，也不宣稱完整重跑蒸足／SPA 所有寫入流程。

## HQ 課程店顯示蒸足：原因與影響

- 舊版 `b48ecdc3` 的 HQ 店舖列表第 85 行只有 `industryModule === "SPA" ? "SPA／美容美體" : "蒸足"`，COURSE 落入 else。原因是標籤映射漏接，不是該顯示程式修改資料庫模組。
- 現版本列表、詳情及建立表單明確處理 COURSE。Chrome HQ 列表實際確認：五家課程測試店皆顯示「運動課程」，蒸足及 SPA 標籤也維持正確。
- 隔離庫五家課程店的 `Store.industryModule` 全為 COURSE；執行時 `industry-module-server.ts` 依此欄位區分三種模組，並非讀取中文標籤。
- **獨立的舊測試資料缺漏**：原 0915、0916 測試店均無 `StoreModuleInstallation`；0915 另無 `ShopConfig`。兩店已有課次／卡片（分別 9／2、11／8），但這不等於已經通過標準建店檢核。缺漏會使 HQ 的模組安裝檢核失敗，不能以目前 `operatingStatus=ACTIVE` 當作標準交付證據。現有資料無法證明缺漏的歷史建立原因。
- 本次保留上述舊資料原貌，沒有補造歷史安裝時間或覆寫使用者設定。新店 A、B 已由正常 HQ 流程建立完整安裝、設定與試用紀錄；新店標準交付證據以這兩店為準。舊店若需重新執行 HQ 啟用，須先補齊其建置資料，這是保留限制。

## 資料隔離：實際唯讀 SQL 結果

檢查隔離庫全部五家 COURSE 店：

|核對|結果|
|---|---|
|課程預約／購買／卡片／體驗收款|依序合計 29／6／11／3 筆，仍在 Course 專屬表|
|課程店在 Booking、BookingSlot、CustomerPlanWallet、StoredValueWallet、Transaction 的資料|各表均 0|
|課程店在 SpaBooking、SpaPayment、SpaStoredValueWallet 的資料|各表均 0|
|以課程 Customer 關聯反查蒸足 Booking／Transaction|均 0，未僅依交易 storeId 判斷|
|非 COURSE 店的 CourseBooking／CoursePurchase|均 0|
|CourseBooking 對應顧客、課次、卡片的跨店關聯|0|
|CoursePurchase 與 `course-purchase:` 現金帳的店別或金額不一致|0（核對既有配對；不代表單憑此查詢證明所有訂單都應有收款）|
|`course-` 現金帳來源落入非 COURSE 店|0|
|課程通知引用蒸足 bookingId／SPA spaBookingId|0|
|通知顧客或 courseBookingId 跨店|0|
|課程店人員獲授 hq.* 權限|0|
|既有 LINE 已送出紀錄|仍僅原授權三則；本次未發送|

共用 `CashbookEntry` 是設計上的營運帳本，課程購買、體驗、更正及退款以各自來源 ID 與 storeId 寫入；不能把使用共用帳本視為誤寫蒸足交易。Customer、Staff、ShopConfig、健康與營業時間也是共用且依店別存取，課程預約及額度不改用蒸足錢包。

## 共用修改與回歸範圍

|共用來源／修改|隔離方式與核對|證據類型／結果|
|---|---|---|
|HQ 建店、列表、詳情|COURSE 原子建立；Steamfoot 保留時段；SPA 保留 PROVISIONING|新課程 A／B 已實際建店；本次實際 HQ 標籤通過；實際 action mock 驗證蒸足 56 時段／7 日及 SPA 不建立蒸足時段|
|feature-gate／單店試用|有日期的單店試用先套既有規格；COURSE 不取得總部／跨店功能|trial、entitlement、onboarding 回歸通過；沿用新店 3 人上限及跨店 404 實測|
|store-resolver／LIFF 入口|COURSE 無本店 LIFF 時不借用其他店；Steamfoot／SPA 原 fallback 保留|presentation／SPA routing 回歸通過；沿用新店 B 同店網頁入口實測|
|預約入口與模組防火牆|三模組查詢與寫入守衛分開|industry-module／route-isolation 回歸；上述 SQL 無跨模組交易|
|提醒、到期通知、店長通知|舊引擎排除 COURSE；課程引擎限定 COURSE 及專用 trigger／courseBookingId|reminder、expiry、low-balance、manager、cron 回歸通過；無新增外發|
|設定／人員權限|courseManager 先檢查店別、模組及權限；設定依 storeId 寫入|settings-permissions、staff-permission-save 回歸通過；無 HQ 權限誤授|
|Steamfoot 原預約明細|在隔離店實際點開既有回歸預約|Chrome 顯示已完成、原 10 堂方案剩 9 堂、原到期日與還原狀態入口；沒有變成課程點數／名單流程，未執行還原|
|SPA 原首頁／排程|由 SPA 首頁點擊預約管理|Chrome 抵達 spa-schedule，原人員／位置時段表及新增預約入口正常；沒有導向課程月曆。此項為讀取／導覽，非重跑收款|

本次本機針對性回歸 **19 檔／205 測試通過、0 跳過**（15:22，Vitest 4.1.11）。涵蓋 industry-module-firewall、industry-booking-route-isolation、industry-modules、course-store-onboarding、store-onboarding、store-feature-entitlement、pr-e-store-presentation、single-store-trial、single-store-trial-service、course-settings-permissions、course-staff-permission-save、course-reminders、course-manager-notifications、course-reminder-cron、course-expiry-reminders、course-low-balance-reminders、spa-booking-actions、spa-liff-member-routing、spa-release-guard。

功能版本 CI：Targeted tests、Changed-file ESLint、Typecheck、Full Vitest baseline、postgres-integration、Vercel 均成功。PostgreSQL 獨立作業 [35303407263](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/35303407263) 沿用實際隔離資料庫回歸；不能把一般 Vitest 沒有資料庫的跳過項目列為通過。Cloudflare 仍為失敗但依授權豁免。

## 結論與界線

本次發現的 HQ 錯標原因已明確，現版修正已於真實頁面核對。所查現有資料及受影響回歸未發現課程交易混入蒸足／SPA；這是上述範圍的證據，不是對所有未執行情境的保證。

新店標準建置證據仍有效；舊人工驗收店建置資料不完整另列限制。LINE 真實事件／Flex／按鈕、正式發布及正式資料庫遷移的既有待驗界線不變。維持 Draft，等待使用者驗收，沒有正式上線授權。
