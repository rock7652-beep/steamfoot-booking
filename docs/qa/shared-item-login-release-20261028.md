# 項目核心：登入驗收與發布準備

狀態：已整合最新正式程式並完成隔離真實登入檢查；線上候選部署／登入驗收尚待完成，不可宣告正式上線。

## 候選與正式基準

- 獨立驗收支線：`review/shared-item-login-20261028`，不修改main或其他工作區。
- 程式整合提交：`3a88788e28e966b5053f89f6dfae2544872609d9`，整合本次核心修正`3f33619`及最新正式main `979c95681a66734dfa4913ad429a1148821b6025`；無衝突，保留營運工具列與HQ月結更新。
- Vercel：team `team_IAPnhzLHM4x540wiXg3lTyS9`／project `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`（steamfoot-booking）。
- 已查證正式版本：`dpl_FxTqGE2xa5g1Gb3X4ZVkt4sa2qv5`，READY／production，commit `979c956`；實際alias包含`www.steamfoot.com`及`steamfoot.com`。此版本是本次發布前的回復參考點，發布當下仍須再核對。
- 上述兩條修正／驗收支線已關閉Git自動部署；測試站更新走下方既有Preview支線。沒有推送或合併main，也未部署正式站。

後續測試站更新：使用者指定可使用運動／美業既有測試站後，已核對美業支線專屬`BEAUTY_HOSTED_PREVIEW=1`、模組開啟、通知關閉、legacy資料庫模式及LINE憑證空值（未讀取或解密AUTH_SECRET）。以保留歷史的merge整合原測試站`03752d87`；美業頁面的既有HQ導向修正已包含在新版main，解衝突後候選程式與已驗收`46a4f68`完全一致。未丟棄舊測試站修正或強制推送。

已快轉更新遠端`preview/beauty-ui-alignment-20261021`至`d92a4fa8f546f30678eb2052481cf5f3a3322c88`，觸發Preview建置`dpl_EoFv1FBUZHQTU5DFuZWU4SPDp7gU`，target=null，未推送或合併main。測試網址：`https://steamfoot-booking-5kolc37cz-rock7652-2111s-projects.vercel.app`。建置／登入結果於完成後補記，不能把BUILDING視為可驗收或正式發布。

第一版遠端編譯與靜態頁產生完成，但部署階段因`api/image-announcements`未壓縮函式252.31MB超過250MB上限而ERROR，該網址不作交付入口。依Next.js文件與執行程式搜尋結果，在`next.config.ts`僅新增`outputFileTracingExcludes`排除`artifacts`驗收資料夾；未排除執行程式、Prisma用戶端或憑證，也未開啟大函式beta或變更方案。型別、lint與圖片公告相關回歸補驗後重建Preview；原始完整14,134項結果對應封裝調整前的相同業務程式，不冒稱已重跑整套。

## 真實登入檢查

`scripts/qa/item-core-login.mjs`使用明確的本機隔離資料庫與乾淨環境，不載入任何部署環境檔。OWNER及STAFF皆經真實登入表單、Auth.js、Next Server Actions與Route Handlers；不注入cookie、不替換auth、不mock權限。

三模組合計 **19項通過**：未登入讀取拒絕1項；運動、音樂、美業各6項：OWNER登入、授權模組入口、跨店請求拒絕、登出後session清除、STAFF登入、無權限操作拒絕。跨店／無權限寫入後核對教室筆數不變。瀏覽器pageerror為空，對外網路請求封鎖。

結果：[results.json](../../../artifacts/item-core-login/results.json)。本機帳號及店家皆為專用合成資料；未使用銀百合會員、店長身分或正式款項。

限制：沒有為了本機測試更改原生模組rollout條件，因此這19項只證明整合候選的實際登入及權限邊界；不能冒稱「三模組原生核心完整流程已在正式登入站驗收」。項目購課／扣抵完整交易證據見[前批報告](shared-item-core-phase2-20261028.md)，兩種證據不能取代線上完整驗收。

最初本機啟動遭工作區依賴symlink範圍限制；webpack另不支援現有Prisma載入方式。改成工作區內的依賴副本並沿用原Turbopack後，真實登入檢查通過。未修改正式Prisma載入程式。

整合候選另補驗真實PostgreSQL交易：2檔15項通過，原地付款瀏覽器2項本輪跳過（前批9組已完成）；重驗三模組安排、購買、合計、FIFO、更正及原流水保留。全套回歸最初因執行環境禁止同步子程序，部分建置守門測試回傳EPERM；換成允許子程序的執行設定後排除此環境原因。第一輪完整回歸另有6檔21項失敗，皆為本批規則變動後尚未更新的測試：舊方案限制／運動補課預期、搜尋下拉未展開，以及缺少服務項目或同項目查詢的fixture。已更新並個別驗證6檔84項通過；最終全套結果另列下方，不把第一輪失敗算成通過。

最終全套回歸：**1,460個測試檔通過，14,134項通過、191項明示跳過**（總計1,482檔、14,325項；未指定實體環境的測試維持跳過，不算通過）。另行指定隔離資料庫的15項交易測試如上，不將它們與本輪全套數字混加。TypeScript、異動腳本與測試ESLint、`git diff --check`已通過。沒有因為既有373項目標測試通過而跳過整合後的完整檢查。

驗收後已停止本機伺服器並刪除本次專用Docker測試容器，結果與截圖保留，沒有留下本輪測試登入工作階段或排程程序。

## 線上驗收前置

使用者同意運動／美業測試站皆可使用。美業既有Preview支線`preview/beauty-ui-alignment-20261021`更新前的READY部署為`dpl_DfK6WWTMavHZz3HBqgc4A9b2Fi1F`，commit `03752d87ca2692958e95064ebd11aac80e715a25`。這不是本次候選，不可拿舊站的登入成功宣稱新程式驗收。

目前可用的瀏覽器profile未列出測試站登入；已請使用者選擇開啟安全登入頁或確認既有profile已登入，不索取明文密碼。候選須達到READY、確認隔離資料庫與通知停用，再以候選確切commit驗收。

線上驗收須依序核對：候選commit／資料庫隔離→OWNER／受限STAFF登入→項目A排課→有無方案皆可安排→無方案點○阻擋→原地購課→同項目10+20合計→先買先扣→恢復原來源一次→重送不重複收入→其他店家與B/C項目拒絕。期初與來源補課沿用原規則，只有音樂保留其既定補課流程。

## 發布與回復

測試站完整驗收、最新main差異與建置檢查均通過後，才進行正式發布審核。部署前固定候選commit、正式基準與回復部署ID；不批次改卡、不重建取消預約、不補造歷史。發布後唯讀核對銀百合兩位指定學員的同項目餘額、取消紀錄與收入未遭改寫。

若程式回復，保留所有已提交購買／扣堂／返還與稽核，不回滾資料庫或刪除交易；先核對回復版與本次新增合法流水的相容性。無資料庫schema變更需求。
