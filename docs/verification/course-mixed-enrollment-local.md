# 音樂／運動混合排課的登入驗收

從 repository root 執行：

```sh
node scripts/qa/course-mixed-enrollment-local.mjs
```

需要既有 Node dependencies／三組 Prisma clients、可用的本機 Docker socket、`postgres:16-alpine`、Playwright 與 `/usr/bin/chromium`。3107、55438 必須空閒。腳本只建立 task-owned、loopback-only PostgreSQL container；沿用既有 `SPORTS_LIVE_FLOW_QA` 精確驗證邊界，不接受遠端資料庫或 hosted metadata。

完整步驟：建立 disposable DB → 安裝現行 main/course Prisma schema 與驗收所需既有 metadata DDL → 建立兩個合成門市、真實帳密與學員 → 啟動 Next development server → 真實登入 → 新增開放選課＋固定一人的課程 → 三種視窗尺寸保留草稿 → 確認 server action 成功 → 獨立查 PostgreSQL 的總名額、固定預約與 OPEN 規則 → 重新進入原生名單 → 三種尺寸檢查。沒有 auth/action mocks，沒有正式帳號、正式資料、收款或通知收件人。

流程保留 `/tmp/mixed-local-acceptance/{music,sports}/save-results.json`、表單與名單截圖。暫時帳密只在 mode 0600 的 `/tmp/mixed-local-access.json`；不得提交或外傳。腳本在成功／失敗時關閉自己啟動的 server、移除自己建立的 container。若執行中被強制中斷，應先核對 `codex.task=course-mixed-enrollment-local-qa` 標籤，再清理該 container；不可清除其他既有服務。

這是本機 Next development 全流程驗收，不是 Vercel 保護層、實體 iPad、正式資料庫 migration 或通知送達驗收。隔離 PostgreSQL 交易案例另由 `course-mixed-enrollment-audit.yml` 在 PR 上執行，要求 39 項混合排課／運動方案測試零跳過，並回歸 4 項既有音樂／運動購課與扣還堂案例。驗收門市包含已設定的單次收費方式，確認一般課不會要求畫面上不存在的收費欄位；體驗課仍須驗證收費選擇。
