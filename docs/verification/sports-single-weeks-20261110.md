# 舞蹈／運動單次排課安排週數

- 需求：2026-11-10 使用者確認，比照音樂的「安排週數」，十週一次建立。
- 基底：`236d637d`，本地變更；未 push、未部署、未改資料庫。
- 入口：HQ 店家視角與門市原生運動／舞蹈課表 → 新增排課 → 單次。
- 變更：預設 1，允許 1–53 整數週，每隔 7 天建立獨立 SINGLE 課次；共用 `createCourseSchedule` 交易、逐堂衝突檢查及原請求重送核對。指定學員套用整批名單，開放選課不自動加入。每週／隔週永久系列及體驗維持原行為。
- 不新增資料讀取、不變更授權及通知設定，不涉及 Cloudflare。

## 證據

`npx vitest run src/__tests__/sports-schedule-native-ui.test.ts src/__tests__/sports-schedule-allocation.test.ts src/__tests__/sports-schedule-compensation-access.test.ts src/__tests__/sports-permanent-series.test.ts src/__tests__/course-actions.test.ts src/__tests__/sports-schedule-replay.test.ts`：6 檔、104 項通過。涵蓋 1／10／53 週、跨年日期、無效數值、指定／開放名單、體驗批次拒絕、永久系列、批次單次不誤判固定系列及實際撞課整批拒絕、失敗草稿及相同請求重試；後端使用替身，非正式資料交易。

`node scripts/qa/sports-single-weeks-browser.mjs`：實際表單及共用視窗的 Chromium 合成預覽，1440×900、1366×768、1024×768、768×1024、600×768 均通過。檢查頁面無橫向溢出、週數欄位可用、送出可到達、尺寸及類型切換保留十週、失敗後原請求重試。截圖及 results.json 在 `/tmp/sports-single-weeks-ui/`。所有後端行為為 stub，無正式資料或通知。

適用操作情境 04／08／10：批次提交、尺寸與失敗保留。非本次變更的課表載入效能、完整搜尋、換店與多人更新未另做實測。未進行登入後端到端、真實 iPad 或正式站驗收，不將合成預覽當成完整業務通過。

後台操作指南 C173 已補充週數及十週用法。

程式檢查：受影響檔案 ESLint 無錯誤；`course.ts` 有既有 `musicStore` 未使用警告（本次未改該處）。`git diff --check` 通過。全專案 TypeScript 原預設 4GB heap 不足，改以 Node 8GB heap 檢查；最終版本 `NODE_OPTIONS=--max-old-space-size=8192 node node_modules/typescript/bin/tsc --noEmit --incremental --tsBuildInfoFile /tmp/sports-single-weeks.tsbuildinfo` 通過（exit 0）。
