# 正式體驗店生命週期與既有隔離環境核對（2026/09/20）

## 決策與界線

9/30 對象為正式環境的正式店家，初始 EXPERIENCE。後續 HQ 升級 BASIC／GROWTH／ALLIANCE 沿用同店、帳號、會員、LINE 關聯與交易。體驗版不是工程帳號。停止另建付費試用專案；歷史提案 `course-fixed-trial-environment-20260918.md` 已作廢。正式資料僅唯讀，未進行正式遷移、建店、部署、合併或外發。

## 環境實查

|環境|實查結果|能否承接|
|---|---|---|
|目前 steamfoot-booking 課程 branch preview|008c1295，deployment dpl_DwCD3K31kNUU43ydqYYRtbf4w21z READY；build preflight 明確 databaseIsTest/directIsTest=true，course_schema_readable=true，points_schema=20260917094700，trial_schema=20260917143018|可繼續 A 店隔離網頁驗收；固定 alias 不變。分支更新會更換部署，不冒充凍結正式版本|
|steamfoot-preview / ttworfzgwejdeolegkxl|既有 ACTIVE_HEALTHY 測試資料庫，保留 A 店及其他內部測試店；店家與角色在服務層隔離，不能僅憑網址認定隔離|沿用；A 店人員、用量、期限與既有資料未改|
|另一既有 Vercel booking-system 專案|唯讀 metadata：最近 production target ERROR，另有 READY preview；project metadata 未列 DB 環境變數，不能据此斷言不存在 DB。尚未確認它是否即使用者所指測試站、其實際 DB 與可用版本|不可宣稱已可替換目前驗收環境；不自行切換、不要求換店|
|正式 steamfoot / qijlnhtpbintanzpxkvf|唯讀 information_schema 核對：Store、StoreSubscription、StorePlanChange、StoreModuleInstallation、StaffMemberLink 存在；CourseTemplate、CourseSession、CourseBooking、CoursePointCard 不存在|正式課程不可直接交付；需完整課程遷移順序、備份／恢复證據與發布批准。本輪未執行正式 DDL|

## 生命週期：實作與驗收分開

|項目|既有實作／本次修正|證據與尚缺|
|---|---|---|
|HQ 建立 COURSE 體驗店|store-onboarding 沿用共用建店；COURSE 初始 EXPERIENCE/TRIAL；未驗收前不寫開始／到期日|沿用新店 A/B 瀏覽器證據；不以 0916 特殊方案證明試用|
|入口可用後啟用 30 天|single-store-trial：entryAcceptanceConfirmed、模組與入口檢查、3人限制、subscription lock、TRIAL_STARTED 歷史、禁止重啟|既有 PostgreSQL 並行及試用測試通過；不重設 A 店期限|
|既定額度|3 位啟用人員；100 顧客、100 本月預約沿用原規則；課程用量採課程來源|A 實頁3/3、3/100、6/100；既有超額及月份／取消計數證據沿用|
|到期與停權|既有 subscription-guard 判斷台灣日期及目前訂閱；後台寫入經 requirePermission 保護|本次發現前台課程營運 mutation 缺少此共用檢查，008c1295 已補：預約、取消、報到／出席、更正、購買。讀取保留，不自訂新日期／方案規則|
|升级原店|upsertStoreSubscription 更新同一 Store 的 currentSubscription／plan／dates、PLAN_ACTIVATED 歷史；不更新會員、卡片、預約或身分綁定|BASIC/GROWTH/ALLIANCE 三方案單元案例通過；實際 HQ 升級前後全資料快照、既有會話與 LINE 登入仍待隔離內部店補驗，不更改 A 店方案|
|升級恢復寫入|共用 guard 讀取目前有效訂閱；不要求重建會員|到期唯讀、寫入拒絕及升級恢復之單元案例通過；未宣稱瀏覽器到期／升級流程實測完成|
|蒸足／SPA|本次程式只改 COURSE actor helpers 與 course actions，共用 guard 本身未改|Full Vitest、postgres-integration 及其他 CI 通過；不是新增蒸足／SPA 全流程實機證據|

## 最新驗證

- 008c1295 固定 alias：兩位 A 店會員全新 Chrome 390px 會話登入成功；兼任者切會員／教練成功；純會員無工作入口。
- 前台方案 remaining10、held5、available5；9/21伸展剩2位。後台本人已報到／待出席、共卡學員取消／釋放2點，與前台一致；本輪只讀回，不重寫餘額。
- A 新課尚未到開課時間：9/20 10:00 堂數卡、9/21 10:00 點數卡出席／重送／更正仍待實際操作；不回填時間、不解除時限。既有其他隔離交易證據沿用，不冒充本次 A 閉環已完成。
- 本機相關8檔38測試通過；其後加強三方案案例的2檔11測試通過。型別與變更檔 lint 通過。
- 008c1295 CI：Changed-file ESLint、Full Vitest baseline、Targeted tests、Typecheck、postgres-integration、Vercel 全通過。Cloudflare 失敗依既定豁免，非通過。
- Chrome 尺寸模擬不等於實體 LINE／Safari／iPad。沒有新外發。

## A 專屬 LIFF：待一次核准設定包

現有 Developers 登入有效，已唯讀核對 Provider 管理權，不需再次登入。

- Provider：蒸管家 2005295754。
- LINE Login channel：蒸管家｜會員登入 2010761154，Published；沿用既有，不新建 Provider/channel。
- 只新增 LIFF「課程隔離驗收 A」；Full；openid、profile；Add friend Off。
- Endpoint：固定工程 preview 的 `/s/course-start-0918-a/liff`，完整 host 沿用 A 固定入口。
- 權限：該 Login channel 的 LIFF 管理權；已有 Provider Admin 可操作。無需更改 Messaging API、Webhook 或圖文選單。
- 系統：只把新 LIFF ID 登錄到 ttworfzgwejdeolegkxl 的 A 店；不得寫入正式庫或覆蓋其他店 LIFF。
- 回復：清除本次新 A 設定、刪除本次新 LIFF；既有 LIFF、登入綁定與店家不變。
- 完成後手機入口為 LINE Console 實際產生的 `https://liff.line.me/<新ID>`；尚未建立，不捏造可用 ID。
- 這項設定不外發。真實事件／Flex／按鈕，需另列測試對象、完整內容、事件及則數獲准；既有三則純文字不重送。

## 最短後续及 9/30 風險

1. 現在可使用 A 固定網頁入口，核對方案→共卡代約→單人取消→占用釋放；已通過項目不用重跑。
2. 開課後補 A 出席／重送／更正；由工程核對額度及紀錄。
3. LIFF 設定包核准後建立，手機登入→會員／教練切換→回到同店；再獨立申請事件 Flex 外發。
4. 在內部隔離店補 HQ 到期／升級操作與記錄保留，不能用調整 A 店規格代替。
5. 正式庫缺課程表：9/22前備妥遷移與恢復審查、9/25首店可驗、9/26–27實機；未完成则9/30的5–6店LIFF交付有風險。正式执行须另行明确授权。

結論：目前可繼續既有隔離 A 店驗收；不需新付費資源。尚非「正式店家可交付」或「正式發布完成」。
