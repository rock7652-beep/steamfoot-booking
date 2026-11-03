# 項目核心：登入驗收與發布準備

> 本次上線審查版本不包含新增的驗收截圖及原始結果檔；下列 artifacts 路徑為當時紀錄的來源，並非此版本內的連結。驗收結論僅適用所載版本及條件。

狀態：已整合最新正式程式、完成隔離真實登入檢查，並成功部署美業Preview候選。另已用直接Playwright完成美業Preview OWNER購課、合計、扣抵與返還。後續運動／音樂實際登入、追加修正與效能限制見[本輪報告](shared-item-hosted-courses-20261028.md)，不可宣告正式上線。

## 候選與正式基準

- 獨立驗收支線：`review/shared-item-login-20261028`，不修改main或其他工作區。
- 程式整合提交：`3a88788e28e966b5053f89f6dfae2544872609d9`，整合本次核心修正`3f33619`及最新正式main `979c95681a66734dfa4913ad429a1148821b6025`；無衝突，保留營運工具列與HQ月結更新。
- Vercel：team `team_IAPnhzLHM4x540wiXg3lTyS9`／project `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`（steamfoot-booking）。
- 已查證正式版本：`dpl_FxTqGE2xa5g1Gb3X4ZVkt4sa2qv5`，READY／production，commit `979c956`；實際alias包含`www.steamfoot.com`及`steamfoot.com`。此版本是本次發布前的回復參考點，發布當下仍須再核對。
- 上述兩條修正／驗收支線已關閉Git自動部署；測試站更新走下方既有Preview支線。沒有推送或合併main，也未部署正式站。

後續測試站更新：使用者指定可使用運動／美業既有測試站後，已核對美業支線專屬`BEAUTY_HOSTED_PREVIEW=1`、模組開啟、通知關閉、legacy資料庫模式及LINE憑證空值（未讀取或解密AUTH_SECRET）。以保留歷史的merge整合原測試站`03752d87`；美業頁面的既有HQ導向修正已包含在新版main，解衝突後候選程式與已驗收`46a4f68`完全一致。未丟棄舊測試站修正或強制推送。

已快轉更新遠端`preview/beauty-ui-alignment-20261021`至`d92a4fa8f546f30678eb2052481cf5f3a3322c88`，觸發Preview建置`dpl_EoFv1FBUZHQTU5DFuZWU4SPDp7gU`，target=null，未推送或合併main。測試網址：`https://steamfoot-booking-5kolc37cz-rock7652-2111s-projects.vercel.app`。建置／登入結果於完成後補記，不能把BUILDING視為可驗收或正式發布。

第一版遠端編譯與靜態頁產生完成，但部署階段因`api/image-announcements`未壓縮函式252.31MB超過250MB上限而ERROR，該網址不作交付入口。依Next.js文件與執行程式搜尋結果，在`next.config.ts`僅新增`outputFileTracingExcludes`排除`artifacts`驗收資料夾；未排除執行程式、Prisma用戶端或憑證，也未開啟大函式beta或變更方案。型別、lint與圖片公告相關回歸補驗後重建Preview；原始完整14,134項結果對應封裝調整前的相同業務程式，不冒稱已重跑整套。

最終候選：**`a54afcff1da472b18948f1f1799ef47419d7abd6`**，部署 **`dpl_6ae6JkCrBphnVVFjTn72hypwTipB`**，**READY／Preview（target=null）**。遠端完整編譯與部署成功；封裝調整後另通過5檔26項圖片公告回歸、TypeScript及lint。

交付登入入口：[美業測試站](https://steamfoot-booking-6qmkv3gmm-rock7652-2111s-projects.vercel.app/hq/login?store=beauty-hosted-20261021)。線上唯讀確認登入頁200，HTML部署識別與本候選一致；session回應200且無登入使用者；未登入名單API回403及success=false；圖片公告API GET回405，沒有原生依賴載入500錯誤。詳見唯讀證據（原始證據：`artifacts/item-core-login/hosted-read-results.json`）。沒有將這些未登入檢查算成線上OWNER購課／點名驗收。

部署後再核對正式版本仍為`dpl_FxTqGE2xa5g1Gb3X4ZVkt4sa2qv5`／`979c956`，`www.steamfoot.com` alias未變。沒有正式發布、遠端DDL或正式交易。

## 真實登入檢查

`scripts/qa/item-core-login.mjs`使用明確的本機隔離資料庫與乾淨環境，不載入任何部署環境檔。OWNER及STAFF皆經真實登入表單、Auth.js、Next Server Actions與Route Handlers；不注入cookie、不替換auth、不mock權限。

三模組合計 **19項通過**：未登入讀取拒絕1項；運動、音樂、美業各6項：OWNER登入、授權模組入口、跨店請求拒絕、登出後session清除、STAFF登入、無權限操作拒絕。跨店／無權限寫入後核對教室筆數不變。瀏覽器pageerror為空，對外網路請求封鎖。

結果：results.json（原始證據：`artifacts/item-core-login/results.json`）。本機帳號及店家皆為專用合成資料；未使用銀百合會員、店長身分或正式款項。

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

## 免費替代方式：實際 hosted OWNER 驗收

使用者指定其他驗收方式後，改用工作區 Playwright 直接連線已核對的美業 Preview stable alias，候選仍是 `a54afcff`／`dpl_6ae6JkCrBphnVVFjTn72hypwTipB`。使用隔離店 `beauty-hosted-20261021` 的臨時 OWNER 帳號正常提交 Auth.js 登入表單；不沿用或索取使用者密碼，不讀 AUTH_SECRET、不偽造 session，不替換 server action、資料庫或權限。瀏覽器僅放行該測試站來源，環境 HTTPS proxy 公開根憑證只匯入可刪除的暫存 Chromium profile，沒有停用 TLS 憑證驗證。Vercel 使用範圍限定該 alias、TTL 3600 秒的臨時分享入口。

實際通過：

- 正常登入後 session 為指定隔離店 OWNER，實際班表載入，pageerror 空。
- 自有合成顧客無方案時，原生新增預約只選服務項目，沒有方案選擇器；送出成功且初始 cardId=null、debit=false。
- 點選待服務圓圈開啟同頁購買方案；真實購買自有 A10、A20，兩筆收入分別 10000／20000，沒有重複購買。購買後仍 RESERVED、未扣次，名單可顯示 30 次。
- 點名後原生名單 30→29，再恢復待服務 29→30，URL 不變。真實流水先對較早購買 A10 記錄 -1，再對同一張卡 +1，A20 保持20。保留原流水，沒有 SQL 修改額度或歷史。

購買後先顯示「結帳完成，方案已加入」及同一顧客視窗，關閉後回原名單。最初腳本誤以為付款後立即顯示名單、等待 exact `10 次` 而逾時；另一次結帳通知匹配兩個元素造成 strict locator 失敗。這兩次是定位條件問題，沒有重送購買；後續依已提交資料續驗，不能把失敗腳本整輪報成通過。

此輪只建立自有隔離顧客／兩個方案等 fixture，其餘預約與會員不變；測試款項無金流連線、不發通知。結果保留於 `artifacts/item-core-login/hosted-*-results.json`、截圖及 `hosted-owner-ledger.json`。腳本 `scripts/qa/item-core-hosted-browser.mjs` 為單次 fixture 用；預設唯讀 probe，異動階段須明示 QA_ALLOW_ISOLATED_WRITES=1，已提交的購買階段不可重跑。私密 access、密碼與 cookie 檔案不納入版本控制。

限制：未把本輪美業流程當成運動／音樂原生線上驗收；受限 STAFF、跨項目 B/C、購買重送等線上案例仍須另補，既有隔離交易／單元測試結果不可替代這些線上證據。沒有正式部署、正式資料改寫或遠端 schema 變更。

補充畫面與權限：1366×900、1024×768、768×1024 名單都能顯示合計30次，文件未水平溢位；登入 OWNER 請求不屬於自己的店家名單 API 回403／success=false。先前 cleanup 腳本以為取消會開原因表單，實際原生功能使用確認對話框；預設自動拒絕，未改資料。已按原生取消流程補驗，不調整正式功能。

收尾已完成：透過原生確認取消本次自有預約（CANCELLED、debit=false），兩張卡仍為10＋20，原購買／扣次／返還流水保留。專用User已SUSPENDED、Staff已INACTIVE，自有兩個測試方案已下架；只撤銷本輪新建的 alias 分享入口，不影響既有部署／使用者分享權限。臨時密碼、access、cookie state 與暫存含憑證 browser profile 均已刪除。腳本語法、ESLint與git diff檢查通過；本輪未改業務程式，不重複宣稱重跑14,134項全套。

後續候選已更新至 `cc4c96f4`，僅部署既有運動／音樂 Preview 支線；實際登入結果、修正所屬店長與課名、各版本證據及效能限制，詳見[運動／音樂驗收](shared-item-hosted-courses-20261028.md)。此段不變更上方美業證據對應的版本。
