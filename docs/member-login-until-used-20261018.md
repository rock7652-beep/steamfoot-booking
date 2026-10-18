# 已核對的會員登入恢復授權不再限天數

店家核對本人及手機確認碼後，授權只適用該店、該會員與已驗證的 LINE 身分，持續有效直到完成登入或撤銷。每次使用仍重新驗證 LINE token、會員歸屬、手機及原登入快照；完成後消耗一次授權。未確認的申請仍保留 24 小時確認期限。

新增 LineRebindRequest.untilUsed，只有精確 pinned Login reason 可設為 true，資料庫 constraint 同步限制。原 expiresAt 保留供歷史與一般重新綁定使用。後台顯示「已核對，登入前持續有效；等待顧客完成登入」，不將已授權誤稱已登入。

Migration 僅轉換有 AUTHORIZE_VERIFIED_LIFF_LOGIN_RECOVERY 稽核、尚未消耗、仍 PENDING_CAPTURE、未合併且 ACTIVE CUSTOMER、店內手機唯一、原手機/owner/Login 快照一致的精確授權；不轉換一般舊遷移、不核准未審申請、不恢復已撤銷或已消耗項目。轉換另留稽核紀錄。

## 驗證與上線限制

- 13 個相關測試檔 211 項通過；另新增既有授權升級測試。
- PGlite 執行實際 migration SQL，驗證有條件轉換、重跑不重複及 constraint 拒絕 generic 永久授權。
- TypeScript、針對服務及 migration 測試的 ESLint、git diff --check 通過。
- 尚未完成 hosted Preview、桌機/iPad 畫面驗收或真實 LINE 登入核驗，不能視為完整業務驗收。
- 套用 steamfoot-preview（ttworfzgwejdeolegkxl）的 schema + 授權轉換被自動審核拒絕：未認定此測試專案已獲明確授權。沒有重試，也沒有修改正式資料庫。
- 此 review 分支的 hosted build 於 ci-migrate 開頭停止，避免未核准的資料庫操作。取得測試資料庫明確授權後，先驗證 migration 與 Preview，再規劃正式 rollout；正式 schema 必須先於引用 untilUsed 的程式上線。
