# 音樂真實登入與美業方案／體驗關懷提醒

## 範圍

沿用 `preview/beauty-ui-alignment-20261021`，起點 `e0aa5056`（應用版本 `947ea7e7`）。不合併 main、不建立 PR、不部署正式站、不修改既有 LINE 開關、憑證、角色或權限。

## 音樂真實登入

使用使用者指定的 `qa-lubymusic-staff-20261017@example.invalid`，既有 `store-lubymusic` / `lubymusic`，原 STAFF / User 均 ACTIVE，未新增帳號、未改密碼或權限。舊任務已封存帳號均保留停用。

在應用 `947ea7e79b1111947cec723e0ab2ccc6963651e1` 的真實 Preview 完成 4 項驗證：

- 共用後台登入 → 本店期間消耗統計 → 正確堂數欄位與顧客經營導覽，第一頁 50 列。
- 原帳號無 customer.export，UI 不顯示 CSV，直接匯出被拒絕，未提升權限。
- 篩選視窗送出後保留音樂店家範圍。
- 1366×900、1024×768、768×1024、390×844 均無整頁水平溢出。

音樂真實畫面可能包含既有顧客姓名與電話；未遮蔽截圖僅留本機，不保留在本輪共享提交，證據目錄只記錄無個資的結果／數量。

這是實際帳號、應用、資料庫的登入後唯讀驗收；Chromium 模擬尺寸不是實體 Safari／iPad，亦非店家簽收。先前 `/staff-login` 已屬退役模組入口，不作為音樂登入入口；使用 `/hq/login?store=lubymusic` 的既有共用後台登入。

## 美業共用 UI 與資料接點

- 方案提醒沿用 `CourseLowBalanceSettings` 的同一份表格、搜尋／篩選、分頁、批次草稿、修改／儲存／取消與預覽；新增 saveSetting / store / revision / beauty / readOnly 插槽。運動／音樂預設行為保留；美業使用「次」、預設到期提醒關閉。
- 體驗關懷沿用 `TrialCareCard`，新增美業 saveSettings / stopCare 插槽、草稿保護、修訂及 LINE 關閉文字。不是另畫美業介面。
- 店家切換、跨店方案、舊修訂、撤權與母子店只讀由 server action 驗證；共用 UI 只讀控制另外停用。方案剩餘／到期設定由 beautyPrisma 在同一 Store 鎖交易寫入 BeautyPlan，兩種規則一起成功或回滾，revision 增加，保留稽核。
- 體驗關懷沿用通用 TrialCareSetting / Preference / Log；美業日誌 module=BEAUTY。儲存要求目前 updatedAt 修訂；重新啟用建立新的 activatedAt，不覆寫顧客停止接收。
- 顧客停止／恢復沿用原 BalanceReminderPreference 元件，提供 `/s/<slug>/beauty/reminders`；實際 Beauty member 身分決定本人，不接受客戶指定其他顧客。方案偏好使用 core MessageTemplate 的美業命名空間；不使用課程方案偏好或扣堂帳本。店家只能停止關懷，無法替顧客恢復接收。

## 方案與關懷邏輯

- 各張有效、未結清且方案未下架的卡分開計算；剩餘減 RESERVED 占用後判斷門檻。占用仍有剩餘時不誤稱「用完」；真實 remaining=0 使用獨立用完階段。
- 到期提醒依店家個別設定天數，在台灣 18:00 後核對當日到期階段；已全被預約占用、已到期或已退款結清的卡不寄到期提醒。日期更改重新核對，沒有跨日補發已錯過階段。
- 最後處理前再次鎖定同店 Store，重新核對方案狀態、卡片、當前 memberIds、占用、有效日期、顧客狀態、功能授權與停止接收；撤除共用授權或顧客合併／停用不寄。
- 每卡／成員／階段使用固定識別碼；既有 SENT / FAILED / PENDING 皆不另發一筆。發送結果不明記錄為未確認，不自動新發；共用 verified transport 提供收件人核對、店家渠道與額度檢查。
- 新完成的已建檔體驗才建立固定的首次完成 marker；匿名同行者不歸到付款人。關懷查詢排除啟用前已完成的舊體驗，因此恢復再完成也不重啟歷史旅程；新完成的跨午夜體驗仍可進入。
- 沿用原三階段規則與文案、台灣時間及 15 分鐘錯過不補發、每天最多一封關懷、每位顧客每階段一次。後續邀請在已購方案／取得共用卡、待核帳、已有下次預約時跳過；本人已停止則所有階段跳過。
- 課程／蒸足的交易、顧客歸戶、扣堂、分潤與通知對象不搬入美業。BeautyPayment、BeautyLedger、剩餘次數與收入計算不更改；issueCard 的 frozen 型別僅排除與購卡快照無關的新提醒欄位。

## LINE 與資料庫邊界

- LINE 環境開關維持 0；新 worker 在模組關閉、通知開關關閉或 Preview 時，在任何資料讀取、排隊與外送前返回。共用 transport 仍有第二層 Preview 防護。沒有實際 LINE 登入或送達驗收。
- 接入既有 `/api/cron/beauty-notifications`，沿用原 CRON_SECRET 授權及每 5 分鐘 cron，不新增排程。服務通知總設定與方案／關懷各自 opt-in，均受環境開關限制。本輪不啟用任一真實排程外送。
- 僅 `steamfoot-preview` 新增 `BeautyPlan.expiryReminder` JSON 欄位，預設 `enabled=false,days=[14,7]`；當時 4 個既有方案全部預設關閉。Migration `20261022150936 / beauty_plan_expiry_reminder_settings`，加法 SQL 位於 `scripts/sql/beauty-reminder-settings-upgrade.sql`。沒有修改 schema 以外的既有帳務資料。
- 後續新環境安裝順序：原美業安裝、同行升級、既有 plan-care 升級，再套本次提醒設定升級，最後部署相容應用。升級可重跑且不覆蓋店家設定；回退先回應用，保留欄位。正式資料庫尚未套用，需另外授權。
- Security advisor 保留既有 BeautyPlan `rls_enabled_no_policy` INFO；未放寬 anon / authenticated 或新增 policy。新欄位繼承原表權限；不是藉新增欄位開放瀏覽器直讀。參考 https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy 。
- 專用角色的真實 worker 連線與 LINE 正式啟用仍未驗；既有 dedicated-mode 通知拒絕守衛保留，不能把這次共用 transport 測試當作正式角色切換或送達證據。

## 驗證狀態

- 18 個測試檔 238 項通過：美業規則、寫入／修訂／店家／權限、LINE-off 零讀寫、模組關閉、共用成員撤除、到期／退款、停止接收、去重、不明結果、歷史／跨午夜實際 PostgreSQL 查詢、原交易扣次、原音樂／運動與體驗關懷回歸。
- 97 個合成瀏覽器案例通過：原共用元件、美業／運動／音樂、25 個含長名稱及下架方案、桌機／平板／窄版、設定儲存重開、修訂更新、草稿跨尺寸保留、只讀控制及 LINE 關閉文字。後端和外部網路封鎖，不等於真實業務或實機驗收。
- 本機最終 production Turbopack build、TypeScript 及相關 ESLint 通過；虛擬 loopback 連線，不執行 migration。
- 美業本次 hosted 設定儲存／重開、負向、本人停止／恢復與還原：部署後補記。驗證前快照：15 筆預約、10 筆付款、總額 15500（含歷史技師費種類）、卡片餘額 2 / 5、訊息及關懷紀錄 0、店家 notifications=false。
- 店長 LINE 通知發送仍未接入；實體裝置、店家簽收、真實 LINE 及正式啟用仍待完成。

證據：`docs/beauty/evidence/care-reminders-music-20261022/`。
