# 課程約定書：隔離整合

分支：`codex/course-agreements-core`；基底：`3a00ca95`。
原作者為本任務；未建立 PR、未 push、未合併、未部署。
未連線寫入正式資料庫、未執行 migration deploy。

## 已實作

### 資料與權限

- 四張新表：門市草稿設定、已發布版本、審閱憑證、簽署證據。
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

這一步只完成店長設定與版本發布，不提供學員簽署、QR Code、PDF、既有簽署紀錄或備份入口。
請假文字設定不會修改既有預約系統的 cancellationLeadMinutes；介面明示需確認與實際規則一致，完整固定時刻的預約執行仍待後續串接。

## 開放條件（尚未設定）

預設關閉。未完成 migration 與隔離驗收，不得開啟。

- `COURSE_AGREEMENTS_ENABLED=1`：後台入口與伺服器操作同時開放。
- `COURSE_AGREEMENT_LINK_SECRET`：獨立、伺服器專用的高熵隨機金鑰，至少 32 bytes，須安全備份並與已發布版本共同保留。
- 簽署 token 以帶命名空間的 HMAC 綁定 storeId、versionId。版本僅存 token hash，後續授權的分享服務可重建 token；目前未新增公開分享路由。金鑰異動會影響既有連結，不能當作一般環境變數直接替換。

不得向前端暴露金鑰或在日誌輸出 token。

## 驗證證據

- Prisma validate 通過，使用假本機 URL；generate 僅產出本分支本機 client，沒有資料庫連線。
- 四份 Vitest 測試共 62 項通過，其中約定書測試 24 項、既有設定工作台回歸 38 項。
- SQL migration 在 PGlite 記憶體資料庫實際執行：跨店關聯、不可覆寫、重複簽署、瀏覽器角色禁止直接讀取。
- 服務層以 Prisma 替身驗證草稿 revision、相同請求重試、預覽雜湊、版本快照、金鑰及授權；不代表真實 PostgreSQL 併發／交易驗收。
- 新增服務、Action、介面與設定測試通過 ESLint。新頁面／工作台／服務／測試的依賴範圍型別檢查通過；全 repo tsc 耗用超過 4GB 記憶體後主動停止，不宣稱全站型別通過。
- `scripts/qa/course-agreement-settings-browser.mjs` 使用真實 React 工作台與共用元件、合成資料及替身操作，封鎖外部網路請求。
- Chromium 模擬 1920×1080、1366×900、1024×768、768×1024、600×900、390×844；編輯無整頁水平溢出、縮放保留草稿。
- 預覽另驗 1366×900、1024×768、768×1024、390×844；確認固定 21:00 文字、勾選前禁止啟用、失敗重試、儲存後重開、切店隔離及門市返回路由前綴。瀏覽器無 pageerror。
- 本機圖與結果：`/workspace/reports/course-agreements-settings/`。靜態 fixture，沒有完整 dashboard 外側欄、真實登入、DB 或真機驗收；不把它稱為已部署 Preview 或完整業務通過。
- 操作情境採 03／04／06／07／08／10；情境 01 課表切月、02 清單搜尋、05 詳情側滑、09 HQ 功能三態非本階段變更。沒有修改共用容器；本功能仍受音樂資格、開放旗標及角色權限隔離。
- 無 Cloudflare 路由或設定變更，本階段不依賴 Cloudflare。未執行會觸發 migration 的 npm build，也未啟用任何通知。

## 店長操作說明（待開放後適用）

到課程設定的店家資料，開啟「課程共同約定」。依序填寫店家資料、課程規則與個資告知，按「儲存並預覽」核對全文。確認適用範本與實際執行規則後，勾選確認並按「確認啟用」。修改草稿不影響既有簽署文件；重要條款更新須重新提供審閱及必要確認。

## 下一階段

串接學員閱讀、成年／未成年法定代理人、一次性審閱憑證、電子簽名、私有儲存、PDF 及後台查詢匯出。

正式開放前另需：

1. 在獨立 staging PostgreSQL 驗證 migration、RLS、交易併發與完整登入流程。
2. 審閱提供時間、確認時間與簽署時間須保存實際值，不宣稱單純勾選已滿五天或放棄法定權利。
3. Customer 只能經可信識別明確連結，不以姓名／電話自動認領。
4. 確認保存期限、依法刪除／封存與備份還原機制。immutable trigger 僅為一般操作保護，須另設受控清理程序。
5. 完成真實後台桌機／iPad 驗收、地方適用條文與個資告知確認，再提供發布方案供核准。

本 migration 尚未執行。禁止直接把原型 SQLite／JSON 雲端快照搬入正式資料庫。
