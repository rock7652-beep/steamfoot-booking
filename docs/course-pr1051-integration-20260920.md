# PR #1051 整合與發布停點（2026-09-20）

## 實際交付

- PR #1051 最新 head `c7909461eef7cfc28aeb930c1423bde72ecc3055` 已整合至 `codex/course-scheduling-stage1`，PR #1051 已顯示 merged。這不是合併 main 或正式發布。
- 保留課程分支最新 `5c6827c64a8a099f110a1e14ab92eb060755fa9f` 的正式唯讀核對文件，沒有覆蓋並行更新。
- 整合及日期修正功能提交：`cf265f51dfc55a0f4e64538f1c1fcfd32f8cbd3b`。
- 對應隔離 Preview：`dpl_6GJbm9XdHjRhfdin4C3wD46Q65ER`，READY；A 店原分支 alias 不變。
- 本機 git push 沒有可用 GitHub 登入；改用已連接 GitHub 的 create_tree/create_commit/update_ref，保留兩個父提交並只做 fast-forward。未搜尋或匯出任何 secrets。

## 本輪驗證

|項目|結果與界線|
|---|---|
|受影響保留期／試用／預覽隔離測試|5 檔 46 項通過|
|日期表單回歸|4 項通過：原生日期輸入未觸發 React change 時提交可見值、週期帶入後覆寫、必填清空不沿用舊值、選填清空|
|型別與變更檔案 lint|本機及 CI 通過|
|CI|run `35488316998`，lint/typecheck/targeted/full baseline 四個 job 均 success|
|隔離 PostgreSQL|run `35488317004` success；保留期三方案 3、預約 32、退款 3、課程體驗 6、啟動並行 1；各個 no-skip gate 通過|
|HQ 日期瀏覽器|整合 Preview、正常 HQ 登入與訂閱表單，儲存後重開及資料庫讀取一致|
|一般店長端|未完成：登入後仍為 Staging Admin（ADMIN），不能算 OWNER 驗收；下一次指定店長安全登入未完成，未重設密碼或搜尋憑證|
|正式備份恢復|缺少既有正式 PostgreSQL 連線，尚未執行；此執行環境也未接通原 Mac 指定的離線 Docker 目標|

## 日期問題及實頁證據

舊保留期 Preview 的 `retention-release-0920-day30` 表單，手動把到期日從 2027-09-22 改為 2027-09-21 並儲存，列表仍為 2027-09-22，重現先前未驗過的問題。

修正：三個日期欄位加入 name 與對應 label，支援原生 input 事件；提交從 FormData 取可見欄位值，保留既有後端驗證與授權，不變更方案計算規則。

整合 Preview 在同一個合成測試店驗證：

1. 手動起始日 2026-09-20、生效日 2026-09-20、到期日 2026-10-25，按儲存。
2. 重開三個欄位值一致；唯讀 SQL 核對 Store／StoreSubscription。
3. 年繳「依週期帶入」為 2027-11-19，手動覆寫回 2026-10-25，清空選填生效日後儲存。
4. StoreSubscription 最終 startedAt=2026-09-20、effectiveAt=NULL、expiresAt=2026-10-25，原 subscription ID `retention-release-sub-30` 不变。

這是正常訂閱 UI 操作合成隔離店，不是正式收款，沒有更改 A 店。未宣稱實體 iPad／Safari 鍵盤驗收。

## A 店保護及既有證據

唯讀核對 `course-start-0918-a`：EXPERIENCE／TRIAL，2026-09-18 至 2026-10-17，currentSubscriptionId=`cmu6daps3001gl8048gm3vkop`；StoreSubscription 同為 TRIAL、到期日 2026-10-17。本輪沒有寫入 A 店資料。

先前核心預約、占用／取消、出席與更正、防重送、使用者手機 LINE 收件與 Flex 返回證據沿用。不重發訊息；A 店原自動提醒設定不變。

15 份 SQL 與 `course-full-migration-rehearsal-20260920.json` 逐檔 SHA256 核對全數相同，沒有新遷移。本輪沒有以合成 PostgreSQL 測試替代真實備份恢復。

## 已授權與仍缺的存取

使用者已授權推送及驗收通過後合併上線；不再把發布授權列為待確認。仍須依序完成：

1. 使用既有隔離店長 `course-lifecycle-0920@example.test` 正常登入，驗證店長保留期提示、可讀／匯出、新增阻擋、升級後原會話恢復，以及不能進 HQ／跨店。A 店不得用於改期限造案例。
2. 由原憑證保管者提供既有正式 PostgreSQL URI，存至原 Mac 已指定私有 source-connection.txt，不貼對話、不提交 Git、不重設密碼、不搜尋其他憑證。Supabase Connect 的模板仍需要既有資料庫密碼。
3. 在原已授權無網路 Docker 新資料庫 `course_prod_restore_20260920` 執行唯讀一致性備份恢復與完整性驗證。此雲端工作區無法直接讀取 Mac 私有路徑或操作 Mac Docker；本機執行者需提供演練結果，或另接通同一個已授權執行環境。
4. 真實副本驗證精確 15 份遷移、兩份既有 TrialCare Prisma 歷史核正、雙歷史及最終版本配對；依既有 runbook 完成後才合併 PR #1022 到 main 並正式發布。

截至本紀錄：未匯出正式資料、未執行正式 DDL／歷史核正、未合併 main、未正式部署；停點是技術存取及未完成驗收，不是缺少發布授權。
