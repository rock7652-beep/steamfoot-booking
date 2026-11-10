# 課表原地學員視窗與方案上課紀錄

需求來源：使用者 2026-11-10 截圖指出，從上課名單點學員資料會把背景切到顧客管理，且看不到此份方案的上課紀錄；比較圖另指出原名單缺少方案名稱、到期日與明確扣抵狀態。

版本：基底 `236d637d` 的本地修改，與同聊天週數修正共存。未 push、未部署，未寫正式資料庫或通知設定。Cloudflare 非本次依賴。

## 最終行為

- HQ 與門市課程課表的學員資料選單改為原地視窗，課表／名單不卸載、不改網址。先顯示同課堂姓名／電話，使用共用 TTL 0 panel reader 取得資料；關閉、切人與範圍變動隔離晚到回應。原學員工作區新增 `panelOnly` 入口，背景不插入顧客管理工具列。
- 課表傳入 storeId，後端重新核對目前門市、booking.read、本課堂學員及學員資料可見範圍；從原會員頁抽出共用資料 loader，沿用 customer.read、模組、功能、唯讀及各項操作權限。原會員頁同用此 loader，原頁功能保持。
- 原生運動／舞蹈名單：綁定卡片時顯示實際方案名稱、單卡剩餘、期限及上課紀錄入口；未綁卡則保留按項目合計，但明示「適用方案合計／查看方案」，不虛構已使用的方案。預約具有缺席扣抵政策不表示已扣堂。
- 卡片詳情有「此方案上課紀錄」，包含日期條件、分頁及展開狀態；以 customerId + 實際 cardId 在後端篩選，不按方案名稱推測或前端分頁後過濾。後端核對 customer.read、booking.read、wallet.read、同店卡片及目前／歷史學員關係。未綁卡預約不歸入任何指定卡片。
- 原有美業 source 不使用課程方案資訊，原客戶來源及服務規則保留。

## 驗證

- 10 檔、110 項 Vitest 通過：`course-roster-customer-panel-ui`、`course-roster-plan-summary`、`course-roster-customer-panel-access`、`course-booking-history-expiry`、`course-member-page-parallel`、`course-customer-workspace-ui`、`course-roster-compact-ui`、`course-customer-panel-url`、`beauty-shared-roster`、`course-roster-inline-note-ui`。涵蓋權限／換店拒絕、同名卡片篩選、原地開關、失敗重試、晚到隔離、單卡餘額不混合計、待上課不誤標扣堂與美業共用入口。
- `node scripts/qa/course-roster-customer-browser.mjs`：真實名單、學員及卡片元件，合成資料／stub 後端。Chromium 1440×900、1366×768、1024×768、768×1024、600×768 均通過。確認方案／期限可讀、無整頁橫向溢出、原 URL／課表日期／視角保留、選單原地開窗、關閉回原名單及五次紀錄讀取均含正確 cardId。截圖與 `results.json`：`/tmp/course-roster-customer-ui/`。
- 受影響元件、服務與測試 ESLint 無錯誤；`git diff --check` 通過。全專案 TypeScript 以 Node 8GB heap 執行通過。
- 後台操作指南 C129 已補上原地開啟、卡片紀錄及未綁卡差別。

操作情境適用 04、05、06、08、10。首次完整課表載入、切月份效能、多人實體帳號及正式交易未另測；此合成預覽不代表登入後完整業務、實體 iPad 或正式站驗收。不宣稱已上線。

## 後續版型調整與格子示意（2026-11-10）

使用者後續指出名單方案欄太寬、逐行上課紀錄太長。名單改為剩餘堂數與可點開的方案名稱，方案欄 8rem；期限及紀錄在詳情查看。原生名單與原地學員視窗分別縮為 1000px／880px 上限，紀錄預設收合。此調整的 3 檔 60 項相關測試及五尺寸 Chromium 合成預覽通過。

使用者另確認新示意：實際方案幾堂就幾格，每排 5 格，僅已上課格填日期，其餘留白。`LessonProgressGrid` 已做成可重用呈現元件，`lesson-progress-grid-fixture.tsx` 使用合成十堂方案、兩筆已上課資料；尚未串接正式方案的堂數與完整上課資料，也未改其他模組。不得以剩餘點數、預約數或同名方案猜測總格數與完成日期。

`node scripts/qa/lesson-progress-grid-browser.mjs` 通過 1366×768、1024×768、768×1024、600×768、390×844：10 格、2 日期、8 空白、每排 5 格，無整頁橫向溢出，點日期可顯示該筆使用人；完整紀錄初始收合。圖與結果位於 `/tmp/lesson-progress-grid-ui/`。此為設計示意，非已串接完成或正式可用功能。

## 核准後的本地串接與前台卡片簡化

使用者核准格子版型後，已將課程原生堂數方案接到 `loadCourseCardProgress`。以同店實際課卡、GRANT 堂數、ATTENDED 紀錄及未更正的 BACKFILL 實際上課日期建立格子；不使用商品預設堂數或 remaining 推算。共卡標示整份方案並可點日期查看使用人。三種讀取權限、門市／顧客／課卡關係及共卡可見性重新核對；整組進度在 RepeatableRead 交易取得。來源方案、不完整堂數或特殊多堂扣抵先保留原完整紀錄，不補造日期。多堂數框格於元件內捲動，不把視窗持續拉長。

原地方案視窗上限改 640px 並依內容高度顯示；完整紀錄收合，格子直接顯示。`course-roster-customer-browser.mjs` 以實際讀取元件及 stub 服務驗證五尺寸的十格／兩日期、原網址與日期保留、日期查看使用人及完整紀錄展開；更新截圖 `/tmp/course-roster-customer-ui/live-card-progress.png`。正式資料庫與正式帳號未執行驗收，尚未部署。共用元件可提供其他模組使用，未改動美業／蒸足的資料讀取。

使用者另以會員前台截圖指出「查看明細／收合明細」資訊重複；已移除這層切換，原本受條件限制的確認會到、改期、取消／請假操作直接顯示，保留所有原有資格、截止與確認流程。`course-portal-direct-actions-browser.mjs` 以合成體驗預約驗證 1366×900、768×1024、390×844、360×800：無明細切換、確認會到直接可用、停用自行請假仍無取消控制、金額資訊保留、無整頁橫向溢出。證據 `/tmp/course-portal-direct-actions-ui/`。這是模擬尺寸與後端替身，不代表實體手機、登入業務或正式站通過；未更新前台操作指南。

最終驗證：相關 14 個測試檔、165 項 Vitest 通過（原 12 檔回歸，加會員前台與期初補課前台兩檔）。全專案 `NODE_OPTIONS=--max-old-space-size=8192 node node_modules/typescript/bin/tsc --noEmit --incremental --tsBuildInfoFile /tmp/course-customer-overlay.tsbuildinfo` exit 0；本次檔案 ESLint 無錯誤，`git diff --check` 通過。

## 最新會員課表文字簡化（取代前述課表直接顯示確認會到）

使用者認為會員課表的「確認會到」多餘，並要求刪除重複文字與過多說明。本次僅調整會員課程卡片的呈現：移除課表上的確認會到控制；原通知確認對話與 LINE 入口維持。體驗卡片刪除「體驗不使用方案額度」；停用自行請假時只留一句「請假請洽店家」或可用的聯絡連結，並省略無法使用的取消期限；仍可自行取消時保留取消截止，進入確認後只顯示一次。單人省略「共 1 人」；多人的人數與使用人保留；個人當日課表卡片只顯示時間，跨日預約／歷史仍有完整日期。已有課表模式按鈕時省略日曆內重複的模式標題。價格、付款、出席狀態、適用的方案用量、效期與必要確認保留。

本次 `course-self-booking-portal-ui`、`music-opening-member-portal-ui`、`course-portal-guides` 共 3 檔 42 項通過；涵蓋取消失敗重試、請假扣抵告知、截止、期初補課限制、LINE 體驗確認原流程及精簡後直接查看資訊。`course-portal-direct-actions-browser.mjs` 通過 1366×900、768×1024、390×844、360×800；無重複明細切換與課表確認，沒有「共 1 人」／體驗不扣方案說明／停用取消的截止文字，聯絡提示僅一次，當日卡片僅顯示時間，價款保留且無整頁橫向溢出。更新局部預覽 `/tmp/course-portal-direct-actions-ui/simplified-card.png`。均為合成資料與模擬裝置，非登入後或正式站驗收；未部署，未改動正式預約、扣堂或通知。
