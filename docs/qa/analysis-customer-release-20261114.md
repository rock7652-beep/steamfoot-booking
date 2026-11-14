# 蒸足分析與顧客讀取 — 預覽候選驗收

基底：`efbbe5a15590feecc0b95bf155141eaeb08340aa`（核對遠端 main 仍相同）。候選分支：`fix/analysis-30day-renewals-20261114`。本次使用者授權整理版本與預覽驗收；正式發布仍須另行確認，不啟用自動合併。

## 交付內容

- 蒸足分析沿用共用 BusinessMetric 與響應式 grid，頂部統一來客人次、體驗人數、新卡人數、續卡人數、體驗開卡率。其他產業模組的產品分析程式未改。
- 所選期間首次體驗後 30 個台灣日曆天內的首次有效購卡回計該批體驗，包含次月、第 30 天；第 31 天排除。指標與名單同一選取規則；續卡按付款期間去重，不要求先有體驗，排除取消及無有效淨收款的購卡。
- 顧客搜尋選取接既有快速開窗；主要資料不等待獨立摘要，摘要載入／錯誤／重試及晚到回應隔離另見 [顧客讀取驗收](customer-drawer-read-20261114.md)。
- 此次不修其他全站手動篩選或消費搜尋清除計時器，不更改會員帳務、通知、資料庫 schema。

## 檢查結果

22 個相關測試檔、194 項通過。涵蓋分析 30 天／跨月／名單一致、續卡去重、其他模組分析回歸、顧客開窗／延遲／權限／摘要重試，以及此次與既有顧客預覽隔離回歸。

TypeScript `--noEmit --incremental false`（heap 8192 MB）、所有本次新增／修改的 JS／TS 檔案 ESLint、`git diff --check` 通過。未以帶入部署憑證的本機 npm build 代替預覽；真正建置由經過隔離檢查的 Vercel Git Preview 執行。

## 預覽隔離

共用 release dispatcher 於任何其他 QA opt-in 前檢查本次精確分支、Vercel 專案 `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`、GitHub repository、preview target，要求 DATABASE_URL 與 DIRECT_URL 都符合既有 `ttworfzgwejdeolegkxl` 測試資料庫，拒絕路由／schema 覆寫與 production migration target。若環境不符合，應修正隔離設定，不能繞過 guard。

沿用既有 module-roster-preview，migration dispatcher 在建構資料庫 client 或呼叫 migration subprocess 前退出；測試使用 tripwire 證明。預覽通知仍受既有 runtime-env 阻擋，不恢復任何停發。沿用既有精確專案／分支的預覽輸入與追蹤包裝，避免不必要重建；不改 main 的部署停用設定。

發佈前已唯讀核對 GitHub workflows 與 Vercel Git 整合；非 main 的一次分支推送會啟動預覽，不同時手動再建置。此候選不觸發 production main push，亦不執行手動 migration workflows。

## 後續證據

本機顧客摘要的 Chrome 1366×900、768×1024 合成預覽已驗載入／錯誤／重試；不是正式帳號、實體 iPad 或端到端時間驗收。分析五卡已有實際 SSR 斷言，完整登入頁面仍待此次 hosted Preview 驗收。

預覽 URL、來源 SHA、部署狀態、登入操作、跨月資料及完整顧客讀取耗時須在候選建置完成後，以同一版本補記於 PR／交付紀錄。既有預覽 SHA 不含本次修改，不可沿用為此候選通過的證據。正式店家回報的一分鐘仍未完成相同條件前後比較。
