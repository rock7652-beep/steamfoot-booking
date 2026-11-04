# 獎勵與調整：儲存回饋與密度修正

使用者回報：正式 HQ 美業月結送出後明細未立即出現、清單太疏、必填符號需改半形 `*`。以既有 #1506 功能接續修正，不變更薪資計算規則、權限、migration 或通知設定。

## 原因及修正

原元件只在 Server Action 成功後關閉表單、顯示已儲存，再呼叫 router.refresh；畫面沒有接收本次儲存的明細，只能等完整 RSC／layout 回傳。正常 OWNER 及 ADMIN 登入本機隔離環境均重現表單關閉先於明細出現；並非本次證據顯示資料未寫入，也不把本機結果當成正式事件的完整網路紀錄。

現在在同一筆寫入交易內讀取所選月份明細與鎖定 revision，提交成功才回傳。client 收到確認後立即同步調整列、加減項總額、課程／技師／蒸足摘要；完整報表仍刷新。較舊 RSC revision 不覆蓋較新提交結果，門市／月份／權限範圍重新掛載；換歸屬月份回傳原查看月份的最新明細，不能把別月份列留在本頁。完整 fingerprint 同步前不使用舊月結確認或通知入口。

共用工具列合併標題、搜尋及按鈕，合計與成功提示同列，表格使用 dense，編輯／刪除維持並排及 44px 觸控區。固定日期／金額／操作欄，保留事由完整文字；760px 最小表寬只在區塊內橫向捲動，不造成整頁溢出。必填標籤改為半形 `*`。

## 驗證

- 功能回歸 9 檔 97 項通過，含 PGlite 真 SQL／交易回傳、jsdom 延遲 route 回應、失敗保留草稿、刪除、移月、舊 revision、跨店回應隔離及 Preview 遷移／連線 tripwire。此處的 jsdom action 替身不冒充真實登入。
- 正常密碼登入的 Next.js 16.2.2 + PostgreSQL 17.6 四模組流程：新增加減項、編輯、刪除、重送、跨店拒絕、鎖定／重開／重新確認、資料庫查回。沒有替換 server action。當前工作樹第一次結果見 `live/results.json`；後續最終 commit 的重驗另存 final-live，避免用 base SHA 冒充測試版本。
- HQ／OWNER 美業各 3 次新增：`before-live.json`、`after-live.json`。原版表單關閉到列顯示為 4–312ms（中位 294.5ms），新版 5–12ms（中位 6.5ms）。同一 loopback 裝置與角色，資料量由 0→6 與 6→12 筆，首筆含暖機差異；不以此宣稱正式環境網路速度改善，也不把個別最好值當保證。
- 30 筆相同型態合成資料、260px 側欄占位的比較，正常文字 14px、操作至少 44×44。desktop 1366×900 可完整看見 8→11 筆；1920×1080：11→15；iPad 1024×768：2→7；768×1024：5→11；600×900 窄容器：3→9。含長事由列，非只挑單行資料。前後密度 JSON 與截圖同目錄。
- 四模組真登入截圖及合計另見 live 子目錄；RWD 為 Chromium 模擬尺寸，非實體 Safari／iPad／LINE 真機。
- 既有操作指南與 UI Framework 已同步。

## 重現與限制

沿用 `scripts/qa/monthly-adjustments/live-{prepare,seed,start}.mjs` 準備本次專用 loopback 庫；合成資料及本機憑證僅在 `/tmp`。`live-feedback-verify.mjs --baseline` 必須在舊產品版本執行；修正版不帶參數。完整流程使用 `live-verify.mjs --output=...`，不覆蓋先前 #1506 證據。

密度測試使用既有 Vite fixture；`density-verify.mjs` 驗新版。before 證據取自 `72fda57a` 產品元件的暫存副本，透過 ?before 掛入同一 fixture；測完已移除暫存副本。`--before` 會檢查原版全形標籤，避免把新版誤標為舊版。fixture 只驗共用版面／失敗草稿，與真實 PostgreSQL 流程分開標示。

本輪尚未合併 main／部署正式站，不執行正式帳務寫入。新 Preview 分支只加入既有 exact-branch allowlist，保留相同 repo、隔離 DB 及 migration tripwire，不放寬正式環境 gate。
