# 官網與推薦活動發布交接（2026-11-05）

目前 PR #1514 尚未合併、發布或啟用正式推薦活動。正式 main 查核基準為 `236d637dd9f03f9824bdd92841457e7e9d2a86f3`。本次工作只準備發布條件；不能將本文件視為發布授權。

## 已完成的檢查

- 本機隔離完整建置成功。新增發布檢查及打包工具另以 11 項測試、ESLint、TypeScript 驗證。
- 正式資料庫唯讀工作流程 [42020920745](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/42020920745) 成功：九張必要資料表、RLS 及目錄層級權限齊備；TLS 驗證與唯讀交易已確認。只讀系統目錄，沒有讀取顧客資料或寫入資料。
- 該工作流程使用 GitHub Production 連線，**不能證明 Vercel 實際部署使用相同連線或角色**。也不能以目錄權限取代實際 RLS／欄位寫入及營運核對。
- 正式五張私有推薦資料表已由先前核准工作流程安裝，勿重跑安裝或任選 migration target。
- 三組 Prisma 客戶端以實際 PostgreSQL 17、無網路暫存容器驗證，裁減後都可執行 SELECT 1。11 個保留引擎／憑證檔案雜湊一致；不是正式交易寫入測試。
- 本機 Proxy 依賴約 255 MiB；只縮減八個未使用的非 PostgreSQL WASM 引擎後，保守估算約 232 MiB。保留文件、圖片、憑證、PostgreSQL 與原生引擎。**仍須以正式 Vercel 建置結果確認封裝大小**。
- 原先功能分支的自動 Preview 失敗是既有分支隔離規則正常拒絕，不能解讀為 main 正式建置失敗，也不放寬規則。僅停用本 PR 分支的無效自動 Preview；main 自動部署仍關閉，專用 QA 不受影響。

證據位於 `artifacts/subscription-referral-release/`。之前的官網、推薦流程與 OG 測試記錄保留於各自驗收資料夾。

## 第一階段：核准後發布官網，推薦保持關閉

執行者先取得使用者明確合併與發布授權，再檢查最新 main／PR 差異及 CI。以下設定目前尚未修改。

1. 在正式 Vercel 專案確認既有連線及設定，不輸出秘密。正式專案是 `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`，不是 QA 專案。
2. 初次發布要求 `SUBSCRIPTION_REFERRAL_RELEASE_REVIEW=1`、`SUBSCRIPTION_REFERRALS_ENABLED=false`。`CONSULTATION_PREVIEW_INTAKE_ENABLED` 為 false 或不存在；不得有 QA 設定或 `PRODUCTION_MIGRATION_TARGET`。若發現既有 migration target，先查明用途，不逕自覆寫。先前環境變數列表被截斷，不能推論現值或宣稱活動旗標已查證。
3. 合併 PR #1514 後，從真正 main Git source 手動建立 production 部署；不提升 QA 部署，不偽造 Git metadata。
4. 新增 prebuild 檢查會在既有建置及 migration 流程前確認活動關閉、沒有選定 migration。postbuild 只在精確正式 main 專案與 Vercel build sandbox 裁減非 PostgreSQL 引擎，再以**該次 Vercel 實際 DATABASE_URL** 呼叫既有唯讀目錄檢查。任何必要條件失敗就停止，不自行放寬 grants、遷移或發獎。
5. 確認建置／部署成功後，查正式首頁、美業皇冠與排序、收費表及兩項功能說明；確認 www 的 `/apply`、OG metadata、分享 PNG 可公開存取。availability API 應回傳停用狀態，不能仍為舊站 404。
6. LINE 公開抓取與快取只能在正式公開部署後驗證。舊 Vercel 登入預覽卡片不代表正式卡片；不發送訊息給他人，使用者自行測試分享。

初始官網發布不會啟用推薦、不發放免費天數，也不變更綠界扣款。QA 的帳密與推薦碼不得帶入正式環境。

## 第二階段：另行核准啟用推薦

- 核對正式執行環境、角色及應用程式就緒條件；需要寫入的驗收須先確認授權及資料範圍。唯讀建置檢查不取代完整營運測試。
- 由總部確認月繳／年繳及免費期間如何安排，月繳扣款由外部綠界處理，系統不自動停扣或恢復。
- 取得啟用授權後，先移除或關閉 `SUBSCRIPTION_REFERRAL_RELEASE_REVIEW`，再依實際就緒條件設定正式活動／總部功能旗標。不可在 review=1 時啟用推薦。
- 使用正式有效推薦碼驗證申請歸屬；涉及正式申請、付款或獎勵寫入須依授權執行，不以測試付款冒充真實收款。
- 核對首次付費開通滿 30 天且未退款後，由總部確認扣款安排，使用單一按鈕為雙方各加 30 天。不得自動發獎或自動操作外部扣款。
