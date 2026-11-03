# 課程約定書：隔離整合

分支：`codex/course-agreements-core`；基底：`3a00ca95`。
原作者為本任務；未建立 PR、未 push、未合併、未部署。
未連線寫入正式資料庫、未執行 migration deploy。

## 已實作

### 資料與權限

- 五張資料表：門市草稿設定、已發布版本、審閱憑證、簽署證據與私有簽名 PNG。
- 每筆資料綁定 storeId；複合外鍵防止跨門市串接版本、審閱紀錄及既有 Customer。
- 已發布條款與簽署資料禁止一般 UPDATE/DELETE；修訂以新增版本處理。
- 簽署連結、審閱及收據憑證只保存 hash；簽名檔案預留門市專屬私有物件 key。
- 單一審閱憑證只能產生一份簽署；門市與 requestKey 唯一，供後續重送冪等處理。
- 啟用 RLS，禁止 anon/authenticated 直接讀寫。後續每筆查詢仍須帶門市範圍。
- requireCourseAgreementAccess 沿用 courseManager / courseManagerRead，首批限 business.music。
- 設定與修改需 business_hours.manage；簽署紀錄讀取需 customer.read 與 business_hours.view；匯出另需 customer.export。

### 店長設定 → 預覽 → 啟用

- 入口：課程設定 → 店家資料 → 課程共同約定；路由 `/dashboard/courses/agreements`。
- 沿用 SettingsWorkspaceFrame / Nav / ListRow 與 DashboardLink，保留門市／HQ 路由前綴。
- 大型多步工作台分為店家資料、課程規則、個資告知；預設顯示目前版本，需要時才展開編輯。
- 欄位包含品牌／店名、營業登記名稱、負責人、縣市、地址、聯絡方式與課程規則。
- 請假支援提前時數、指定幾日前幾點、自訂文字；當日截止明定不得晚於課程開始。
- 約定不填每期堂數、價格與期間；每期購買紀錄仍是獨立依據。
- 保留原型的短期補習班範本適用確認及所在地退費條文；未確認適用類型可存草稿，不能啟用。未執行新的地方退款法規調查，不宣稱自動法律審查。
- 個資告知由店家填寫；不沿用私人原型的 Vercel 東京儲存說明。正式服務的處理者、地區、期限及實際告知須另行確認。
- Server Action 重新授權、驗證所有欄位，以 coursePrisma.$transaction + lockCourseStore 保存／發布，不使用會觸發教師通知的 courseTransaction。
- 儲存同內容重送回傳同一 revision；啟用同預覽重送回傳同版本；不同內容與舊 revision 衝突時拒絕覆蓋。
- 伺服器產生預覽及 SHA-256；啟用時重算並比對，防止啟用未預覽的新版內容。
- 保存版本的完整條款與店家設定快照。新版本不改舊版本或已簽文件。
- 表單錯誤就地呈現、保留輸入、同請求可重試；換門市 keyed workspace 不沿用前店草稿。

### 選用與暫停（使用者 2026-11-03 補充）

課程共同約定為選用功能。未建立／未啟用／僅保存草稿均不阻擋排課、購課、上課或既有會員操作；本功能沒有寫入這些流程的必簽限制。

已啟用的店家可按「暫停新簽署」並確認。伺服器以 store lock、revision 與 activeVersionId 再次核對後清空目前啟用版本；不刪舊版或舊簽署，也不連動訂單。舊頁面不能暫停另一人剛發布的新版本；相同暫停請求可安全重試。

### 學員簽署與私有副本

- 店長可取得經管理權限核對的連結與本機產生的 QR Code，不使用外部 QR 服務；網址沿用正式站 deriveBaseUrl 的 canonical origin，拒絕含帳密或不安全來源。
- 公開入口 `/course-agreements/[token]` 只接受具正確格式與資料庫雜湊相符的 token。門市由該版本解析，沒有預設門市、前端指定門市或登入 session fallback。
- 每次閱讀開始先檢查門市模組、營運狀態、音樂資格與目前啟用版本。舊版／暫停的連結不能開始新簽署。
- 審閱憑證使用獨立亂數，僅透過 HttpOnly、SameSite=Strict、production Secure、對應連結 path 的 cookie 傳送；資料庫只存 hash，前端不持有此憑證。
- 閱讀提供記錄及七日有效期限由伺服器保存；有效瀏覽器憑證可續填，沒有硬性倒數五天，也不宣稱已審閱滿五天或放棄法定權利。
- 同門市每分鐘最多建立 100 份審閱紀錄，權威 count 在門市鎖內查詢，非單機記憶體計數。
- 成年學員填姓名／電話；未成年須填學員與法定代理人的姓名、電話及關係，簽名標示為法定代理人簽名。
- 客戶端及伺服器驗證勾選、資料與有限數量／範圍的筆畫，拒絕空簽名、全重疊點、非有限座標、未知欄位與過多筆畫。支援手指、筆、滑鼠與鍵盤，縮放不清除筆畫。
- 前端先預覽學員／代理人與簽名，再確認送出。結果未知時鎖住修改，以完全相同 requestKey 與 payload 重試，避免重複簽署；明確失敗保留輸入。
- 伺服器在 store lock 內再次核對審閱 scope、期限、有效版本及文件雜湊。已消耗憑證只能用原 requestKey／requestHash 查回原結果，不能換資料再簽。
- 筆畫只允許數值，由伺服器建立 SVG 並以既有 sharp 轉成 PNG；不接受使用者上傳任意 SVG 或圖片。單張證據上限 128 KiB。
- 新增 CourseAgreementSignatureAsset 私有 bytea 表，將 PNG、簽署 metadata 與憑證消耗放進同一個資料庫 transaction，沒有外部物件儲存造成的半套成功。PNG hash 為原始位元組 SHA-256。
- 簽名檔綁定 signatureId、storeId 與 objectKey 的複合外鍵，禁止一般覆寫與刪除；啟用 RLS，撤銷 PUBLIC／anon／authenticated 讀寫。沿用專案 Prisma migration 單一歷史，未新增另一套 Supabase CLI migration history。
- 自行填寫的姓名／電話不作為既有 Customer 的身分證據，customerId 保持 null；未新增會員、購課、LINE 通知或其他外發。
- 收據使用與簽署連結不同命名空間的 token；`/course-agreements/receipt/[token]` 只讀對應副本，驗證條款及 PNG 雜湊。暫停／換版不使已簽副本失效。
- 副本顯示當時全文、簽署者、代理人、實際時間、簽名與文件識別碼，可「列印／另存 PDF」。這是瀏覽器列印功能，尚無伺服器直接下載 PDF、後台簽署清單與批次匯出。
- 共用店內裝置可明確選擇「換下一位學員」，新建審閱憑證並清除前位學員表單與筆畫，不沿用其簽署資料。
- 入口與副本都設 private no-store、no-referrer、noindex、nosniff、DENY frame；公開 boundary 保留既有唯讀預覽 write guard，副本拒絕 POST，未開放或靜態指南預覽一律 404。
請假文字設定不會修改既有預約系統的 cancellationLeadMinutes；介面明示需確認與實際規則一致，完整固定時刻的預約執行仍待後續串接。

## 開放條件（尚未設定）

預設關閉。未完成 migration 與隔離驗收，不得開啟。

- `COURSE_AGREEMENTS_ENABLED=1`：後台入口與伺服器操作同時開放。
- `COURSE_AGREEMENTS_PUBLIC_ENABLED=1`：另行開放公開簽署與副本入口；與上一旗標都需開啟。預設不開放。
- `COURSE_AGREEMENT_LINK_SECRET`：獨立、伺服器專用的高熵隨機金鑰，至少 32 bytes，須安全備份並與已發布版本共同保留。
- 簽署 token 以帶命名空間的 HMAC 綁定 storeId、versionId。版本僅存 token hash，後續授權的分享服務可重建 token；僅通過管理權限的分享 Action 才產生公開連結。金鑰異動會影響既有連結，不能當作一般環境變數直接替換。

不得向前端暴露金鑰或在日誌輸出 token。

## 驗證證據

- Prisma validate 通過，使用假本機 URL；generate 僅產出本分支本機 client，沒有資料庫連線。
- 上一階段四份 Vitest 測試共 62 項通過；本階段最終八份測試共 98 項通過（約定書相關 60 項、既有設定工作台回歸 38 項）。
- SQL migration 在 PGlite 記憶體資料庫實際執行：跨店關聯、不可覆寫、重複簽署、瀏覽器角色禁止直接讀取。
- 服務層以 Prisma 替身驗證草稿 revision、相同請求重試、預覽雜湊、版本快照、金鑰及授權；不代表真實 PostgreSQL 併發／交易驗收。
- 新增服務、Action、介面與設定測試通過 ESLint。新頁面／工作台／服務／測試的依賴範圍型別檢查通過；全 repo tsc 耗用超過 4GB 記憶體後主動停止，不宣稱全站型別通過。
- `scripts/qa/course-agreement-settings-browser.mjs` 使用真實 React 工作台與共用元件、合成資料及替身操作，封鎖外部網路請求。
- Chromium 模擬 1920×1080、1366×900、1024×768、768×1024、600×900、390×844；編輯無整頁水平溢出、縮放保留草稿。
- 預覽另驗 1366×900、1024×768、768×1024、390×844；確認固定 21:00 文字、勾選前禁止啟用、失敗重試、儲存後重開、切店隔離及門市返回路由前綴。瀏覽器無 pageerror。
- 本機圖與結果：`/workspace/reports/course-agreements-settings/`。靜態 fixture，沒有完整 dashboard 外側欄、真實登入、DB 或真機驗收；不把它稱為已部署 Preview 或完整業務通過。
- 操作情境採 03／04／06／07／08／10；情境 01 課表切月、02 清單搜尋、05 詳情側滑、09 HQ 功能三態非本階段變更。沒有修改共用容器；本功能仍受音樂資格、開放旗標及角色權限隔離。
- 無 Cloudflare 路由或設定變更，本階段不依賴 Cloudflare。未執行會觸發 migration 的 npm build，也未啟用任何通知。

### 本階段驗證補充

- 新增兩份 migration 依序在 PGlite 執行（第一份沿用上階段未發布檔案）；第二份只新增 requestHash、索引及私有 PNG 表，未改原購課／預約表。
- 公開簽署服務測試使用記憶體 PGlite 與縮小的 Prisma delegate adaptor，實際執行 SQL 與 BEGIN／COMMIT／ROLLBACK；測到 PNG 檔頭與 SHA-256、metadata／檔案原子提交、儲存失敗回復、憑證消耗、同請求重試、拒絕改 payload、代理人資料、暫停後讀副本等。未模擬正式 Prisma driver 與多連線 PostgreSQL 併發。
- 公開 boundary 用真實 NextRequest／NextResponse 測試旗標、路徑、唯讀預覽拒寫與私有標頭。cookie Action 與分享 Action 另以替身測權限、cookie 屬性、錯誤不洩漏與 QR 產生。
- 已檢視 Supabase changelog 與 RLS／Data API 現行指南，確認 grants 與 RLS 為不同層；本階段沒有新增 Supabase Auth／Storage API、資料表公開政策、SECURITY DEFINER 或前端服務金鑰。Postgres 15.19／17.11 的 ltree、舊 pgcrypto cipher、btree_gist／自訂運算子變更與本次 SQL 無直接依賴。未連正式專案跑 advisors 或更改其設定，正式驗收仍須檢查實際角色與 advisories。
- `scripts/qa/course-agreement-signing-browser.mjs` 使用真實 React 元件、合成回應及全外連攔截，Chromium 模擬 360×800、390×844、768×1024、1024×768、1366×900。用 CDP 觸控繪製筆畫，驗縮放保留、法定代理人、未知結果同 payload 重試、下一位清空與店長暫停成功／失敗。
- 產生的合成 PDF 僅驗列印版面，不是正式簽署 PDF。圖、PDF 與結果位於 `/workspace/reports/course-agreement-signing/`；不是部署 Preview、真機或完整登入驗收。
- 本次新增頁面、工作台、服務、Action、測試及 proxy 的依賴範圍 TypeScript 檢查通過；新增與修改的約定書程式通過 ESLint；git diff --check 通過。不宣稱完整 production build 或全站測試通過。

## 店長操作說明（待開放後適用）

共同約定為選用功能，沒有需要可不啟用。到課程設定的店家資料，開啟「課程共同約定」。依序填寫店家資料、課程規則與個資告知，按「儲存並預覽」核對全文。確認適用範本與實際執行規則後，勾選確認並按「確認啟用」。修改草稿不影響既有簽署文件；重要條款更新須重新提供審閱及必要確認。啟用後按「讓學員簽署」取得 QR Code；要停用時按「暫停新簽署」並確認，舊簽署副本仍保留。

## 最終驗證命令

- `node node_modules/vitest/vitest.mjs run src/__tests__/course-agreement-access.test.ts src/__tests__/course-agreement-schema.test.ts src/__tests__/course-agreement-settings.test.ts src/__tests__/course-agreement-public.test.ts src/__tests__/course-agreement-public-boundary.test.ts src/__tests__/course-agreement-public-actions.test.ts src/__tests__/course-agreement-sharing.test.ts src/__tests__/course-settings-workspace-ui.test.ts`：98 passed。
- `node scripts/qa/course-agreement-settings-browser.mjs` 與 `node scripts/qa/course-agreement-signing-browser.mjs`：合成預覽操作通過，pageerror 為零。
- `tsc --project /tmp/course-signing-tsconfig.json --noEmit`：通過，選取本次新頁面、服務、Action、測試與 proxy 根檔及其真實依賴；不是全 repo include。
- Prisma generate 僅產生本 worktree 的忽略檔案；資料表與跨店外鍵由 PGlite 測試實際執行。

## 下一階段

串接店長簽署紀錄查詢、權限保護的直接 PDF 下載及匯出，並以獨立 staging 環境完成整段業務驗收。

正式開放前另需：

1. 在獨立 staging PostgreSQL 驗證 migration、RLS、交易併發與完整登入流程。
2. 審閱提供時間、確認時間與簽署時間須保存實際值，不宣稱單純勾選已滿五天或放棄法定權利。
3. Customer 只能經可信識別明確連結，不以姓名／電話自動認領。
4. 確認保存期限、依法刪除／封存與備份還原機制。immutable trigger 僅為一般操作保護，須另設受控清理程序。
5. 完成真實後台桌機／iPad 驗收、地方適用條文與個資告知確認，再提供發布方案供核准。

本 migration 尚未執行。禁止直接把原型 SQLite／JSON 雲端快照搬入正式資料庫。
