# PR #1346 CI 修正

原提交 `2706c53a` 的 Targeted tests 與 Full Vitest baseline 均在 UI 測試載入階段失敗。`course-coach-work-ui.test.ts` 與 `course-self-booking-portal-ui.test.ts` 未模擬新增的 `sports-staging` action，因而載入 NextAuth，其原生 ESM `next/server` 匯入無法由 Vitest 測試環境解析。

修正兩個 UI 測試的 server action 模擬，保留實際元件渲染及互動斷言。另將體驗課判斷改為明確的數值價格，讓缺少新欄位的舊資料維持一般預約；價格 0 仍為有效體驗價格。

新增三項回歸：付費體驗、免費體驗都不需要一般卡且使用體驗 action；缺少體驗價格的普通課仍使用一般預約 action。兩個測試套件合計 78 項通過，紀錄見 `ci-fix-regression.log`。修改檔案 ESLint 通過。GitHub 最新提交的完整 CI 結果另於 PR 說明更新。

本次沒有變更交易或資料庫核心，未合併或部署正式站，Cloudflare 依使用者指示略過。
