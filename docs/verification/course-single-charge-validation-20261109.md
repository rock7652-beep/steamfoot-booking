# 一般單次課錯誤要求收費方式

使用者在正式後台新增一般單次課，畫面顯示「請選擇本次收費方式」，但表單沒有收費選擇欄位。2026-11-09 唯讀核對 `www.steamfoot.com` 的實際 Vercel deployment 為 `dpl_FhMDhkbBGgpTNjh7j2STj6vu8PHA`，來源 `5b5b8716100ac4c998d4c294f8a7faa6d1e0895c`；混合排課 PR #1526 已合併至 main，當時尚未正式發布，因此缺少混合排課選項與這次收費驗證錯誤分開處理。

原因：`createCourseSchedule` 在交易前已只為體驗課計算收費，但進入店家鎖後仍為一般 SINGLE 課呼叫 `resolveScheduleCharge(requireSelection: true)`。只要店家已有符合項目的有效 `chargeSettings`，這個交易內驗證就會要求畫面上不存在的欄位。先前隔離驗收門市未配置此種收費資料，漏掉這個情境。

修正：交易前與交易內均只為體驗課取得／比較收費報價。一般課仍依教學項目、授課人員、時間、名額及各學員既有權益排課，不建立收費快照或購課紀錄；體驗課保留兩次權威收費驗證與報價漂移檢查。沒有 schema migration、正式資料寫入或通知設定變更。

驗證：

- 在真實隔離 PostgreSQL 重現舊程式的拒絕結果；新增音樂／運動 × 自由選課／指定學員／混合排課共 6 個案例，門市已配置有效單次收費方式。確認一般課可建立、維持原 60 分鐘、不寫收費快照或購課紀錄。
- 混合排課與運動卡權益共 39 項 PostgreSQL 案例通過，零略過。
- 排課、收費設定、體驗選課與原生入口共 68 項相關測試通過；特別確認體驗課在鎖前、鎖內都保留 `requireSelection: true`。
- `node scripts/qa/course-mixed-enrollment-local.mjs` 在全新 loopback DB 重跑成功。fixture 現在包含音樂一般收費、運動 OPEN／ASSIGNED 單次收費與體驗價格；兩模組真實登入、一般混合課儲存、獨立資料庫核對、重開名單，以及 1366×900／1024×768／768×1024 草稿與名單檢查通過，沒有 auth/action mocks、沒有瀏覽器錯誤。截圖與結果位於 `artifacts/course-single-charge-validation-20261109/`。
- 修改檔 lint 無錯誤；course.ts 原有 unused musicStore 警告保留。最終型別與雲端 CI 結果以本修正 PR 的同版 checks 為準。

本紀錄是本機 Next development 與隔離 PostgreSQL 驗收，並非正式站寫入驗收、Hosted SSO 後操作或實體 iPad 驗收。Task-owned DB、Next server 與暫時帳密已清除。正式部署尚未執行；本分支停用 Vercel 自動部署，既有 main／其他分支設定保留。


## 完整業務流程補驗

2026-11-09 執行 `COURSE_QA_LIFECYCLE=1 node scripts/qa/course-mixed-enrollment-local.mjs`。每次使用全新 task-owned PostgreSQL 與真實 Next app，店長與會員均透過正式登入流程操作，沒有 auth/action mock；每個交易結果再由獨立 SQL 查核。

音樂、運動均通過：已有有效收費方式時建立混合課；店長為固定學員及自由選課學員實際購課、收款各 800 元；會員自行加入同一堂課；兩人出席各扣 1 堂，更正各還 1 堂；店長將已出席改為免扣堂請假後返還 1 堂，課程仍未取消／釋出，恢復預約後不重複還堂。音樂團課一般學員請假的原有扣堂規則未變更；本次請假操作是店長更正／免扣堂，不能據此宣稱所有請假均退堂。

結果與代表截圖：`artifacts/course-single-charge-validation-20261109/lifecycle/`。桌機／iPad 名單與排課沿用前述三尺寸；會員選課在 390×844 執行。額外購課流程使用 1366×900；未宣稱實體裝置或付款閘道驗收（CARD 為店長實際收款登錄）。

Hosted Preview 首輪運動完整流程成功；音樂課表發現既有期初資料讀取沿用舊 Preview 分支限制，錯誤 digest `2168097698`。補上混合排課的嚴格隔離 profile，僅放行封存資料讀取；歷史匯入 gate 未變更，新增測試確認 production／錯誤專案／正式 DB／外發憑證仍被拒絕。Hosted 最終結果如下。


## 受保護 Hosted Preview 最終結果

- 最終程式版本 `c8b8b9a264ceff9699948a027b47243c78eb0f5d`，Vercel Preview `dpl_Fr4WqJP8RJ2eh6ZeAtkoLaDjCjAz` READY，隔離 Supabase `ttworfzgwejdeolegkxl`。沒有 migration 或正式 DB 寫入。
- 使用者明確允許僅限隔離 Preview 的 23 小時存取連結；連結與應用程式密碼均僅存私有測試檔案。音樂和運動均以真實 OWNER／CUSTOMER 登入、server actions／交易與獨立只讀 SQL 核對，無 mocks。
- 運動完整購課／選課／扣還堂於前一版 `6603c5fa` 的 `dpl_4tQUu2yvTYv4ugvGqQyhVAj4vtUL` 通過；該版發現音樂封存讀取的隔離限制。修正只影響此項讀取 gate。音樂完整流程於最終版通過，兩模組最後均於最終版重新登入、重開課表／名單與獨立 DB 核對。
- 四筆購課各 800、CONFIRMED，最終各剩 1 堂；每班容量 4、固定 1 人＋自行選課 1 人、剩 2 位。兩人出席扣至 0、更正回 1；固定學員免扣堂請假回 1，課程仍開放，恢復預約後仍為 1。
- 最終版兩模組名單重開與 1366×900／1024×768／768×1024 檢查通過，會員選課 390×844。測試腳本修正了隱藏租借欄位同名、歷史列表多堂課、補課按鈕同名前綴、hydration 等待及 SQL 無排序等驗收定位問題；沒有用 SQL 建立購課、預約或扣還堂結果。
- 任務結束已撤銷兩個暫時連結；8 個自建帳號停用並清空密碼、2 位自建 staff 停用、自己的課程／方案／教室停用，測試課堂及預約取消。四筆合成收款與稽核紀錄保留在隔離 DB。音樂 selfBooking 暫時啟用以 revision 9→10 進行測試，再以 CAS 恢復 false、revision 11；沒有覆寫其他修改。獨立核對 activeUsers／activeStaff／openSessions／reservedBookings 全為 0。
- 程式版同 SHA 的完整 Vitest、Targeted、Typecheck、ESLint、mixed-enrollment PostgreSQL 與 Vercel checks 通過。Cloudflare Workers 外部 build 仍失敗，現行 main `2d39215d` 也有相同失敗（build `467821bd-af3a-4e4d-a436-959e8e25bb7d`）；未取得遠端原因、未修改 Cloudflare 設定。正式網域現有路徑為 Vercel，這項失敗未宣稱已修復。

結果與截圖：`artifacts/course-single-charge-validation-20261109/hosted/`。這補齊 Hosted 驗收缺口；不代表正式站已部署／正式資料寫入驗收、實體裝置或外部付款及通知送達驗收。PR #1528 尚未合併，沒有正式發布。最終附件補錄只新增文件與證據，沿用上述程式版 Preview。
