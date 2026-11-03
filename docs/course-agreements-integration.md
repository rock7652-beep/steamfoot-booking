# 課程約定書：隔離整合

原實作分支：`codex/course-agreements-core`；基底：`3a00ca95`。原作者為本任務。
目前整合分支：`codex/agreements-1502-integration`；已 push 並建立草稿 PR [#1504](https://github.com/rock7652-beep/steamfoot-booking/pull/1504)。未合併正式站，正式資料庫與功能開關未變動。

## 最新合併安排（使用者 2026-11-03 指示）

使用者先要求「稍後跟1502一起合併正式站」，後續確認「好 請執行」。已開始共同發布準備；沒有設定自動排程，必要驗證未完成前不合併。

以 main `d3125942` 整合 #1502 head `e0efbae6` 與共同約定分支 `865efa39`，保留雙方 commit ancestry。唯一衝突在 `vercel.json` 的自動預覽停用清單，已保留雙方項目。#1502 的原分支未被修改；87/90 兩秒內的既有接受結果不改寫為 90/90。其 Preview connection limit=2 未複製至正式環境。

整合相關 19 檔 194 項測試、變更檔案 ESLint 通過；新增預覽邊界 14 項測試通過。`08ad5f3e` 的遠端 Typecheck、Targeted tests、Changed-file ESLint、music-makeup-postgres、sports-shared-card-postgres 已通過；最終 head 必須再核對 CI。完整業務驗收仍未完成，不以合成 UI 測試取代。

隔離測試 DB `ttworfzgwejdeolegkxl` 已執行本次兩份新增 migration；僅新增共同約定表，不執行其他 pending migration。每份 SQL 的 SHA-256 與實際執行結果於同一批次登記 Prisma ledger；MCP 同時留下單筆 Supabase rehearsal migration 紀錄，沒有新增另一套應用程式遷移工具。五張表的 RLS 均開啟，anon/authenticated 均無直接權限。正式 DB `qijlnhtpbintanzpxkvf` 尚未執行這兩份 migration。

整合預覽限定精確 Vercel Preview 分支／repo、既有隔離 DB 與專屬連結金鑰，跳過自動 DDL，保留 runtime outbound suppression。空值 LINE override 未阻止部署繼承，因此改用明確無效的停用值；實際憑證仍被 gate 拒絕。測試分支可用金鑰不可複製至正式環境。

自動審核拒絕建立可轉傳的預覽存取連結，理由為可能暴露私人測試資料。尚未取得該存取授權，沒有改用其他分享 API 或移除 Deployment Protection。現有工具未提供已登入的瀏覽器或可用的開發 OIDC；完整 hosted 登入／簽署／下載驗證因此未完成。

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
- 簽名檔綁定 signatureId、storeId 與 objectKey 的複合外鍵，禁止一般覆寫與刪除；啟用 RLS，撤銷 PUBLIC／anon／authenticated 讀寫。應用程式沿用專案 Prisma migration；隔離環境的 MCP 執行紀錄見本文件開頭。
- 自行填寫的姓名／電話不作為既有 Customer 的身分證據，customerId 保持 null；未新增會員、購課、LINE 通知或其他外發。
- 收據使用與簽署連結不同命名空間的 token；`/course-agreements/receipt/[token]` 只讀對應副本，驗證條款及 PNG 雜湊。暫停／換版不使已簽副本失效。
- 副本顯示當時全文、簽署者、代理人、實際時間、簽名與文件識別碼，可直接下載伺服器產生的 PDF，也保留「列印／另存 PDF」。後台已有查詢與逐份下載；尚未實作批次匯出。
- 共用店內裝置可明確選擇「換下一位學員」，新建審閱憑證並清除前位學員表單與筆畫，不沿用其簽署資料。
- 入口與副本都設 private no-store、no-referrer、noindex、nosniff、DENY frame；公開 boundary 保留既有唯讀預覽 write guard，副本拒絕 POST，未開放或靜態指南預覽一律 404。
請假文字設定不會修改既有預約系統的 cancellationLeadMinutes；介面明示需確認與實際規則一致，完整固定時刻的預約執行仍待後續串接。

### 店長簽署紀錄與直接 PDF 下載（本階段）

本階段接續 `55ebbb08`；未建立 PR、未 push、未發布、未套用 migration，沒有變更正式資料。

- 設定中心「店家資料」與共同約定工作台都提供「簽署紀錄」。入口依音樂資格、全域開放旗標及查看權限顯示，不要求門市目前啟用共同約定。
- 清單路由 `/dashboard/courses/agreements/records`；完整副本路由 `/dashboard/courses/agreements/records/[id]`。頁面頂部用 checkPermission，服務再驗 requireCourseAgreementAccess。可讀範圍沿用既有 own／child store 規則，並拒絕 stale storeId。
- 可搜尋本店全部紀錄的學員／代理人姓名及電話；電話搜尋支援空白、括號與連字號格式。搜尋不只限目前頁面。
- 日期以共同 date-utils 的台灣日期邊界查詢，包含結束日 23:59:59.999；拒絕無效日期與反向區間。
- 每頁 25 筆，以 signedAt、id 倒序穩定排序；count 與 rows 在 RepeatableRead transaction 中讀取。超過末頁時回到有效末頁，不把不存在頁面當成整店無紀錄。
- 清單只讀必要 metadata，不讀圖片、條款全文或 receipt token。停用／換版不排除舊簽署。
- UI 沿用 DataTable、共用 filter toolbar、DashboardLink 與既有設定骨架；表格僅區塊內左右捲動，查看後返回保留門市、搜尋、日期與頁碼。
- 查看權限與匯出權限分離；沒有 customer.export 時隱藏直接 PDF 操作。每次下載都重新驗證權限與門市，不依靠 UI 或先前讀取結果授權。
- 店長 PDF：`GET /api/course-agreements/records/[id]/pdf?storeId=...`，缺 storeId 不猜預設門市。
- 學員 PDF：`GET /course-agreements/receipt/[token]/pdf`，只承認原本的 receipt capability，仍須全域公開功能已開放。此路由不能新增簽署或改資料。
- 學員副本、店長副本及 PDF 共用 verifiedAgreementReceipt，驗證版本／審閱／PNG 與門市關聯、文件 SHA-256 及原始 PNG SHA-256；不以目前店家設定重新建立舊條款。
- PDFKit `0.20.2` 與 types `0.17.7` 已鎖版並更新 lockfile。Noto Sans CJK TC 原字型約 16MB，附原 OFL 授權，只對兩個 PDF 路由加入 Next tracing；PDF 內僅嵌入使用字元子集。使用 Node runtime，pdfkit 設為 server external package。實際部署 tracing／bundle 尚待隔離建置驗收。
- PDF 在記憶體生成，不透過外部 PDF／字型 API，不寫入暫存個資檔案。包含原條款、學員／法定代理人、實際台灣時間、簽名、識別碼、內容 hash 與頁碼；標題不會孤立於頁尾，長段落可完整分頁。
- 所有 PDF 回應含 attachment、正確 MIME／長度、private no-store、no-referrer、noindex、nosniff 等標頭；錯誤保持私有且不洩漏原始 SQL／檔案路徑。
- 下載元件以同源、no-store fetch 取得 PDF。失敗就地提示並可重試，不離開搜尋／副本畫面；更換紀錄或門市 URL 時取消舊請求，晚到的內容不觸發下載。
- 本階段沒有新資料表／migration、購課／排課異動、通知或外發。套件只在獨立依賴目錄安裝，工作分支以 symlink overlay 使用，沒有修改原正式工作目錄的依賴。

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

### 本階段最終驗證

- 約定書與設定回歸共 12 份測試、121 項通過（前階段 98 項，加查詢／PDF／回應／下載狀態與公開 PDF boundary 等 23 項）。
- 查詢測試涵蓋完整 store where、最小欄位、重複讀快照、台灣日邊界、代理人／格式化電話搜尋、分頁、錯誤不當空資料、舊版查閱及匯出再授權。
- 證據測試涵蓋錯店關聯、內容或 PNG 遭改時拒絕輸出；PDF route 測缺 scope、拒絕授權、不可用 capability、錯誤私有標頭與不得先產檔。
- 真實 PDFKit 輸出有 Unicode 字型與簽名影像。`scripts/qa/course-agreement-pdf-artifact.ts` 以 Poppler 檢查合成檔：一般 2 頁（140796 bytes），長條款 4 頁；中文、代理人、電話、台灣日邊界時間、尾段及頁碼可擷取，無孤立標題，並將首／末頁轉圖目視確認。這是合成文件，未使用正式學員資料。
- `scripts/qa/course-agreement-records-browser.mjs` 沿用真實元件與攔截所有外連，合成 53 筆資料；模擬 1920×1080、1366×900、1024×768、768×1024、600×900、390×844，包含側欄占寬、區塊左右滑動及長姓名。沒有整頁水平溢出。
- 模擬操作涵蓋從第二頁搜尋尚未載入的第 53 筆、查看、返回保留篩選、實際下載事件、下載權限錯誤就地重試、讀取錯誤不冒充空結果、清空結果及無匯出權限不顯示下載；pageerror 為零。
- 新增下載元件的 jsdom 測試驗證換 URL 取消前店／前份請求、不觸發舊下載，以及權限錯誤可在原畫面重試。
- 本階段新增服務／頁面／元件／測試與真實依賴的 TypeScript、ESLint 及 git diff --check 通過；未跑會寫 migration 的 npm build，沒有宣稱全站建置或真機通過。
- 合成 PDF、擷取／轉圖與 browser JSON：`/workspace/reports/course-agreement-records/`。QA 需 Poppler 及允許子程序的本機環境。瀏覽器採替身導航與 API；沒有完整登入、Prisma driver 對 staging DB 或多連線併發驗收。
- 影響情境為 02／05／06／08／10；03／04 僅延續先前編輯與簽署的測試，未改交易規則。01 課表切月與 09 HQ 三態非本次變更。未改共用 DataTable／toolbar 原元件。

## 店長操作說明（待開放後適用）

共同約定為選用功能，沒有需要可不啟用。到課程設定的店家資料，開啟「課程共同約定」。依序填寫店家資料、課程規則與個資告知，按「儲存並預覽」核對全文。確認適用範本與實際執行規則後，勾選確認並按「確認啟用」。修改草稿不影響既有簽署文件；重要條款更新須重新提供審閱及必要確認。啟用後按「讓學員簽署」取得 QR Code；要停用時按「暫停新簽署」並確認，舊簽署副本仍保留。

查閱既有文件：到「簽署紀錄」，輸入學員或代理人的姓名／電話、日期後查詢。可逐筆查看全文，或有匯出權限時下載 PDF。看完按「返回簽署紀錄」保留原搜尋條件。暫停新簽署不影響舊紀錄查閱。

## 最終驗證命令

- `node node_modules/vitest/vitest.mjs run src/__tests__/course-agreement-access.test.ts src/__tests__/course-agreement-schema.test.ts src/__tests__/course-agreement-settings.test.ts src/__tests__/course-agreement-public.test.ts src/__tests__/course-agreement-public-boundary.test.ts src/__tests__/course-agreement-public-actions.test.ts src/__tests__/course-agreement-sharing.test.ts src/__tests__/course-settings-workspace-ui.test.ts src/__tests__/course-agreement-records.test.ts src/__tests__/course-agreement-pdf.test.ts src/__tests__/course-agreement-pdf-response.test.ts src/__tests__/course-agreement-download.test.ts`：121 passed。
- `node scripts/qa/course-agreement-settings-browser.mjs` 與 `node scripts/qa/course-agreement-signing-browser.mjs`：合成預覽操作通過，pageerror 為零。
- `tsc --project /tmp/course-records-tsconfig.json --noEmit`：通過，選取本次新頁面、服務、Action、測試與 proxy 根檔及其真實依賴；不是全 repo include。
- `node --conditions=react-server --import tsx scripts/qa/course-agreement-pdf-artifact.ts` 與 `node scripts/qa/course-agreement-records-browser.mjs`：合成 PDF 與查詢／下載 UI 驗證通過。
- Prisma generate 僅產生本 worktree 的忽略檔案；資料表與跨店外鍵由 PGlite 測試實際執行。

## 下一階段

以獨立 staging 環境完成簽署 → 後台查詢 → PDF 下載的整段登入與資料驗收，再核對備份還原與正式發布條件；逐份查詢／下載已完成，不代表已具備完整營運備份與批次匯出。

正式開放前另需：

1. 在獨立 staging PostgreSQL 驗證 migration、RLS、交易併發與完整登入流程。
2. 審閱提供時間、確認時間與簽署時間須保存實際值，不宣稱單純勾選已滿五天或放棄法定權利。
3. Customer 只能經可信識別明確連結，不以姓名／電話自動認領。
4. 確認保存期限、依法刪除／封存與備份還原機制。immutable trigger 僅為一般操作保護，須另設受控清理程序。
5. 完成真實後台桌機／iPad 驗收、地方適用條文與個資告知確認，再提供發布方案供核准。

本 migration 尚未在正式資料庫執行。禁止直接把原型 SQLite／JSON 雲端快照搬入正式資料庫。
