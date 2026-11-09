# 運動收費購買方式：連續編輯版本修正

## 範圍與來源

使用者回報銀百合每個收費項目切換「顧客可購買／僅後台指派」後介面未變，授權修復。修正階段完成本機修改與隔離驗證，沒有正式資料寫入。使用者後續明確同意發布；發布階段依 PR、CI 與實際部署結果另行核對。

基準為 `96a5cc9c413025f064e3bf29402b11fb396b8630`。唯讀 GitHub deployment status 與 Vercel deployment metadata 均顯示正式部署 `dpl_5VVwhKV3jtEZaF1s2bHuiJeDUkub` 為同一 SHA、READY。既有 10/27 修正見 [紀錄](dance-teaching-purchase-trial-20261027.md)；不能再以該修正未上線解釋這次回報。

## 已重現的缺陷與修正

`CourseMemberWorkspace` 儲存成功後以確認回執覆蓋清單資料，不要求路由先刷新。再次開啟表單使用新 `plan`，但 `saveSportsFee` 的 `snapshot` 原本仍取自頁面初次載入的 `sportsData.fees`。因此畫面顯示新版，後端版本比對卻收到舊版，下一次修改會被判定為衝突。此流程共用於各運動收費項目。

改用表單草稿的 `expectedRevision` 作為 snapshot，讓顯示資料、未儲存草稿與送出的版本基準一致。後端版本比對、門市／角色權限、重送與交易邏輯保持原有保護；價格、堂數、效期與資格沒有批次更改。

這是可重現的連續編輯缺陷，尚未以銀百合登入後的實際失敗請求證明所有回報均由此造成。

## 驗證

- 新增 LEGACY／ASSIGNED 兩種模式回歸：頁面快照仍舊、已確認 plan 更新後，下一次修改必須以已確認版本比對。修正前兩例均失敗（送出舊購買方式與舊價格的版本）；修正後通過。
- `fitness-plan-form`、`sports-schedule-compensation-access`、`course-customer-workspace-ui`：3 檔／51 項通過。
- `course-settings-save-receipts`、`course-settings-save-route`：2 檔／26 項通過，涵蓋真正過期修改仍拒絕、跨店限制及重送確認。
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` 通過；預設 4 GiB heap 的首次執行記憶體不足，增加本次程序上限後重跑成功。修改檔 ESLint 與 `git diff --check` 通過。
- 強化 `scripts/qa/dance-settings-browser.mjs`：模擬後端完整版本比對，讓成功回執更新 plan、保留初始頁面快照；每個寬度連續儲存兩種購買方式並重開。390、768、1024、1366 px 全數通過，無水平溢出或瀏覽器錯誤。保留既有體驗排課合成資料回歸。
- 本機預覽與截圖：`/workspace/reports/sports-purchase-revision-20261104/`。目視 1024、1366 px 截圖。使用實際 client 表單、合成資料及回應，外部請求攔截；不代表真人帳號、正式資料庫或實體 iPad 驗收。

未改視覺骨架或指南操作步驟。相關操作情境為修改後返回、儲存成功／失敗與重開；未新增金流、預約或通知行為。Cloudflare 非本次修正必要依賴。正式部署與銀百合登入後驗收待完成。
