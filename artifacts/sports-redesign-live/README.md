# 運動模組既有核心串接與驗收

本次工作僅在本機隔離測試站執行：Next `http://localhost:3107`、獨立 PostgreSQL `127.0.0.1:55438/sports_live_flow_test`。這不是遠端 Vercel 測試站部署；未合併、未部署正式站、未套用正式資料庫 migration。Cloudflare 依指示略過。

入口：`/s/sports-live-flow/admin/dashboard/courses/staging`。需明確開啟 `SPORTS_REDESIGN_STAGING=1` 及既有 `SPORTS_LIVE_FLOW_QA=1`；僅接受 development、本機專用資料庫及指定 Auth URL，偵測部署環境或遠端資料庫即拒絕開啟。預設入口 404。正式排程與正式資料不會自動切換至本介面。

## 已串接範圍

- 教學項目沿用 `MusicSubject`，收費沿用 `CoursePointPlan`／`CourseTemplate`。點數、堂數、效期、共卡開通限制均由既有服務判定。收費規則、教練資格、方案儲存與稽核共用同一交易，失敗整筆回滾。
- 每週、隔週、單次、體驗與出租；教學排課的「指定學員／開放選課」獨立於原有課別。指定學員整批走既有預約保留額度；不足時課次與預約全部回滾。
- 購買、出席扣抵、取消還點、體驗收款與作廢、出租收款與作廢、退款均呼叫既有 Server Action／交易服務。體驗會員自助預約採獨立試課價格，不扣一般方案。
- 僅每週／隔週固定課單堂移動後淡化原位置，無「已調課」等額外標記。原次時段可排單次；不可再建重複固定系列。單次、體驗、出租不淡化。其他課次不跟著移動。
- 原方案／卡片 ID、已購價格、額度與效期不回算。改價與跨視窗舊版編輯衝突已驗證；衝突保留輸入。
- 新課表在可見且未編輯時每 15 秒重讀，回到視窗也重讀；已開啟唯讀名單會同步。編輯中保留輸入。這是輪詢同步，非 WebSocket 推播。原交易頁沿用 60 秒重讀。

## 驗收證據

共 43 項真實流程與資料核對；本次 PR 整理時重跑 100 項測試通過，結果見 `review-verification.json` 與 `review-tests.log`。

| 檔案 | 內容 |
| --- | --- |
| `checks.json` | 真實購買、四種教學類型的兩種參加方式、出租、扣還堂、雙裝置名單同步、重送、整批回滾、固定原位規則 |
| `member-checks.json` | 真實會員登入與選課、指定學員及管理權限拒絕、跨店卡片拒絕、體驗價格核對、體驗預約及取消 |
| `compatibility-checks.json` | 改價保留既有購買與卡片、衝突保留輸入、四尺寸三頁與新增視窗 |
| `final-state-checks.json` | PostgreSQL 再核對固定／一次性異動、取消釋放與租借作廢、舊購買快照 |
| `security-checks.json` | 跨店教練回滾、點數收費重送、空間容量拒絕 |
| `legacy-finance/results.json` | 舊購買及退款、帳本收入／支出、原交易頁另一裝置不重整同步 |

RWD：1440×900、1366×1024、1024×1366、768×1024；教學項目、收費、課表及新增視窗均檢查頁面無水平溢出、視窗不超出畫面。會員另驗 390×844。截圖位於同一目錄。

已通過 TypeScript、變更檔案 ESLint，以及 100 項相關測試（含真實 PostgreSQL 購買／退款／體驗回歸及 10 項環境隔離測試）。未把靜態預覽檢查當成真實業務驗收。真實流程使用伺服器交易寫入，本次 PostgreSQL 讀取用於獨立核對。

## 重跑

限一次性測試資料庫；需先以既有 `scripts/qa/sports-live-flow-seed.ts` 建立基礎資料，再執行 `scripts/qa/sports-redesign/seed-staging.ts` 安裝測試限定 metadata 表及測試會員。請勿對已有驗收資料直接重跑建立流程，也勿在正式資料庫執行 seed。

1. 啟動上述 development Next／獨立 PostgreSQL，兩條 DB URL 必須完全符合隔離守門規則。
2. 設 `DATABASE_URL` 為上述 loopback 測試資料庫，依序執行 `live-check.mjs`、`member-check.mjs`、`compatibility-check.mjs`、`security-check.mjs`、`final-state-check.mjs`。
3. 舊交易驗收使用 `scripts/qa/sports-live-flow-browser.mjs`，設定 `QA_OUTPUT=artifacts/sports-redesign-live/legacy-finance`、`QA_REQUIRE_OBSERVER_SYNC=1`。
4. Playwright 模組位置依環境設定；此工作環境使用 `/opt/codex/cua_node/lib/node_modules/playwright` 與 `/usr/bin/chromium`。測試登入資訊僅為 seed 中的 `.invalid` 假帳號。

本次未驗證公開測試網域、正式部署、真實金流收單與真實通知送達；「收款／退款」證據是系統帳本登錄及沖銷，不代表銀行或刷卡端已實際退款。新頻率／參加方式 metadata 仍為測試站限定表，正式資料轉換需另行審查。

審查限制：測試工作區的課次、出租等讀取上限為 500 筆，未進行大量營運資料壓力測試；未實測實體 iPad、Safari 或 LINE LIFF。審查分支 `codex/sports-core-integration-review` 已停用 Vercel Git 自動部署。
