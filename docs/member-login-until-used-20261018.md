# 已核對的會員登入恢復授權不再限天數

店家核對本人及手機確認碼後，授權只適用該店、該會員與已驗證的 LINE 身分，持續有效直到完成登入或撤銷。每次使用仍重新驗證 LINE token、會員歸屬、手機及原登入快照；完成後消耗一次授權。未確認的申請仍保留 24 小時確認期限。

新增 LineRebindRequest.untilUsed，只有精確 pinned Login reason 可設為 true，資料庫 constraint 同步限制。原 expiresAt 保留供歷史與一般重新綁定使用。後台顯示「已核對，登入前持續有效；等待顧客完成登入」，不將已授權誤稱已登入。

Migration 僅轉換有 AUTHORIZE_VERIFIED_LIFF_LOGIN_RECOVERY 稽核、尚未消耗、仍 PENDING_CAPTURE、未合併且 ACTIVE CUSTOMER、店內手機唯一、原手機/owner/Login 快照一致的精確授權；不轉換一般舊遷移、不核准未審申請、不恢復已撤銷或已消耗項目。轉換另留稽核紀錄。

## 測試資料庫驗證（2026-10-18）

- 使用者已明確授權 steamfoot-preview（ttworfzgwejdeolegkxl）；migration `verified_login_until_used` 已成功套用，Supabase 版本 `20261018063140`。正式 steamfoot 未修改。
- 欄位為 BOOLEAN NOT NULL DEFAULT false；精確 Login reason CHECK constraint 已 validated。
- 測試庫套用前沒有登入恢復授權，既有資料轉換 0 筆，不能稱已轉換正式站的 73 位顧客。
- `scripts/qa/member-login-until-used/preview-rollback-verification.sql` 在測試庫實際執行 12 類案例：已審遷移、一般舊授權、未審、取消、已用、手機變更、舊登入變更、首次登入、歸屬不符、停權、候選已捕捉、已標記過期。只有 2 筆符合條件者轉換；另驗證手機唯一限制、generic 永久授權被拒、重跑不重複、逾原期限可選取、單次使用 predicate。測試 SQL 需要空的 LineRebindRequest，並以完整交易 ROLLBACK 清理。
- 回滾後 User/Store/Customer/Account/CustomerIdentityLink/LineRebindRequest/AuditLog 都沒有該次測試資料殘留。
- 13 個相關測試檔 212 項通過；包含執行服務與 PGlite 實際 migration SQL。TypeScript、服務及修改 UI 的 ESLint、git diff --check 通過。
- Supabase security advisor 對 LineRebindRequest 僅回報既有 RLS 開啟且無政策的 INFO；本次沒有新增公開權限或 RLS policy。

## 畫面驗證與限制

- 受影響入口：顧客明細「本店會員與 LINE」、進階綁定狀態與窄 panel。已核對的登入恢復不再顯示成等待官方 LINE 輸入手機，撤銷按鈕明確標示為「撤銷登入授權」。
- 真實 React 元件＋正式 CSS 的隔離瀏覽器 fixture：1366×900、1920×1080、1024×768、768×1024、390×844、320px 窄容器，6 種情境通過。核對後狀態顯示正確、只送出一次、無整頁橫向溢出、切換尺寸保留狀態；操作高度 44px。截圖與結果保存於工作區 `/workspace/login-recovery-until-used-validation/`。
- 此 fixture 的 server actions 為 mocks，不視為 hosted Preview、實體 iPad 或真實 LINE 端到端登入成功；測試庫驗證也不取代會員本人登入核驗。
- 使用者授權測試資料庫後，review 分支已接上既有 module-roster Preview 隔離檢查：精確分支/倉庫/Vercel Preview、DATABASE_URL 與 DIRECT_URL 必須都指向 steamfoot-preview，否則在建立 DB client 前拒絕。build runner 不執行額外 migration，Next config 同步執行隔離檢查，以涵蓋 Vercel buildCommand override。正式 rollout 需 schema 先於引用 untilUsed 的程式。
- 隔離部署 gate 及其他 Preview 組合回歸 52 項通過。CI 另發現既有工單財務 Postgres 測試在 HTTP request 外呼叫 Next after；補上 request 排程邊界 mock，實際財務 SQL/鎖定驗證不變，通知服務仍由專屬測試驗證。
- 先前測試資料庫操作被自動審核拒絕的阻擋，已由使用者本次明確授權解除；本次已成功完成核准範圍，尚未合併正式站。
