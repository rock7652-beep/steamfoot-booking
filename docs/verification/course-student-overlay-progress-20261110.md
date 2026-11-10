# 排課學員視窗裁切與總覽格子補修

接續已發布 PR #1533（main `c4583d3c`）。使用者實際回報學員資料被外層名單裁切，且總覽看不到方案格子。本次在原批次修正／發布授權下補修；不操作正式排課、會員、方案或通知。

## 原因與修正

- 原地學員視窗掛在已 transform 且 overflow hidden 的名單視窗內，fixed 的座標範圍受祖先限制。將整個學員 overlay 透過 React portal 掛在 document.body，保留 context、原名單、URL、關閉及捲動狀態。SSR 使用 server/client snapshot 避免存取不存在的 document，未更動全站 RightSheet。
- 上課格子原本僅接在方案詳情。本次以 CardBrowser 可選 renderProgress slot 接到學員總覽的堂數方案卡片，沿用 CourseCardProgress 及原權限／門市／資料來源檢查。音樂與原生運動課程共用，外部服務 source 與點數方案不套用堂數格子；資料無法核對仍顯示原原因，不偽造日期或總堂數。
- 本分支維持停用自動 Vercel 預覽，避免未確認隔離的自動建置，正式版本按既有手動流程發布。

## 驗證

- 9 個相關 Vitest 檔、49 項通過：card browser、customer overview、roster overlay、權限、progress、shared RightSheet；portal 修改後 overlay 的 2 項再驗通過。
- 變更元件 ESLint 通過。
- `node scripts/qa/course-roster-customer-browser.mjs`：1440/1366/1024/768/600 寬度方案詳情通過；1366×768、1024×768、768×1024、600×768 從學員選單開總覽直接顯示 10 格／2 日期，姓名與關閉按鈕在 viewport 可點，下方可捲動到底；網址與背景課表保留。
- fixture 特別將外層名單設為 420px 高並保留 transform／裁切，重現實際入口；舊驗證外層與學員高度接近，未抓到這個缺陷。本次不是僅驗學員對話框獨立掛載。
- 瀏覽器使用實際元件、合成資料及後端替身，封鎖所有真實網路，不是正式資料或實體裝置驗收。截圖與結果在 `/tmp/course-roster-customer-ui/`，總覽示例 `student-overview-1366.png`。

完整型別與遠端 CI／正式部署狀態在發布前另核對，不以本檔代替上線證據。
