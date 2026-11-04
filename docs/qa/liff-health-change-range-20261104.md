# LIFF 健康量測摘要比較範圍

- 日期：2026-11-04
- 狀態：本機變更，尚未 push／部署；不代表正式可用。
- 入口：顧客 LINE LIFF 健康頁的量測變化摘要。
- 行為：預設最新一筆與上次比較；選單可選近 3 次至目前已載入筆數，以最新與所選範圍最早一筆計算差值。同日紀錄依既有排序分開比較。不更動歷史清單、圖表篩選、資料讀取及權限。
- 缺少共同指標：保留選單，顯示「此範圍沒有可比較的共同指標」。少於兩筆不顯示摘要。

## 驗證

- `npx vitest run src/__tests__/health-change-brief.test.ts src/__tests__/health-change-and-period-contract.test.ts src/__tests__/liff-health-history-ui.test.ts`：3 個檔案、7 項測試通過。
- 修改檔案 ESLint、`git diff --check`：通過。
- 本機靜態 fixture，Chromium 模擬寬度 360／390／768／1280px：範圍切換數值正確、無頁面橫向溢出，選單高度 44px。截圖位於本次執行環境 `/tmp/health-change-preview/`，不是正式資料或真機驗收。
- 適用操作情境：02（已載入範圍選擇）、08（窄版排列）、10（無共同指標）。無儲存、交易、跨角色或新增請求，其餘操作情境不適用本次局部變更。
- 未驗：LINE 實際入口、真機、登入後完整流程、正式部署。
- 完整型別檢查首次因 Node 記憶體不足中止；以 `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --incremental false` 重驗通過。
