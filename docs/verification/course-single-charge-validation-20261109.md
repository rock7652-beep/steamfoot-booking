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

Hosted Preview 首輪運動完整流程成功；音樂課表發現既有期初資料讀取沿用舊 Preview 分支限制，錯誤 digest `2168097698`。補上混合排課的嚴格隔離 profile，僅放行封存資料讀取；歷史匯入 gate 未變更，新增測試確認 production／錯誤專案／正式 DB／外發憑證仍被拒絕。Hosted 最終結果待下方補錄。
