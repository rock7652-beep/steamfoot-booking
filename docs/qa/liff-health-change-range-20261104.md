# LIFF 健康量測摘要比較範圍

- 日期：2026-11-04
- 狀態：已推送獨立分支並建立 PR #1506；Hosted Preview 驗證進行中，尚未合併／正式部署。
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

## Hosted Preview 分支登記

- 使用者另行授權 push、建立 PR 與部署測試預覽；分支為 `fix/liff-health-change-range-20261104`。
- 首次自動預覽因既有 exact-branch allowlist 被拒絕（`dpl_JA1Y4uwkAyXZy2c36rsrenv4odKd`），在任何 migration／DB client 前停止。
- 僅將本次明確授權分支加入既有 Preview 白名單；保留 repository metadata、Preview target、隔離連線與通知阻擋檢查，未變更 Vercel 專案設定或正式部署規則。
- 隔離與 runtime 回歸加量測元件測試：3 檔、68 項通過。隔離測試的 DB client／子程序有 tripwire；初次沙箱禁止 spawnSync，允許本機子程序後重驗通過。
- LINE OAuth 依現行部署規範不在 Preview 驗收範圍。
