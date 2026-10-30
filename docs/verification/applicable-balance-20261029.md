# 三模組方案剩餘顯示：PR／Preview 驗收

分支：`feat/roster-applicable-balance`。PR：[1469](https://github.com/rock7652-beep/steamfoot-booking/pull/1469)，維持 Draft，未合併 main、未部署正式站。本次未修改正式業務資料。

## 最新需求與實作

- 運動／舞蹈、音樂、美業的名單只顯示「剩餘 20 堂／次／點」。不在名單並列單卡餘額、預約保留量或方案明細；明細在預約詳情。
- 逐張計算 `max(0, remaining - all reserved holds)` 再相加。本堂已有保留亦包括在內：原方案剩 1、續購剩 20、本堂保留 1，名單顯示剩餘 20。點名將保留轉為扣用，不再重複扣一次。
- 重用最新 main 的 `item-entitlement.sumItemBalances`，不同單位分列、共用卡去重。購入方案的額度不合併、不改既有交易或實際扣抵順序。
- 音樂直接重用 attendance 的 `musicItemCards` 適用判斷，保留原期別；期初來源及補課維持原專用流程，不加入原生普通方案合計。
- 運動／舞蹈沿用 `resolveSportsEntitlement`；美業沿用門市／可見顧客／wallet 權限及購入技師快照，不把過期、結清、不適用項目或損壞權益算入。
- 美業背景同步版本納入續購課卡、其他預約群組的保留、服務與技師快照。保留最新 main 的購課恢復、已付款後核對收款及 LINE 全面停發設定。
- 點名確認後顯示額度更新中，等待權威名單回應；合計只供顯示，不授權扣抵。

## 已執行驗證

| 檢查 | 結果與證據 |
| --- | --- |
| 功能回歸 | 16 個檔案、165 項通過：[log](applicable-balance-20261029/targeted-tests.log) |
| 原有 Preview 隔離 | 2 個檔案、39 項通過：[log](applicable-balance-20261029/isolation-tests.log) |
| 本分支精確範圍 | 6 項通過，拒絕 production、main、外庫及錯誤來源：[log](applicable-balance-20261029/exact-branch-tests.log) |
| TypeScript | 全專案 `tsc --noEmit --incremental false` 通過（建置的 TypeScript 亦通過） |
| ESLint | 無錯誤；roster 原有 `readVersion.current` cleanup 警告保留 |
| 美業版本 SQL | 本機 PGlite 執行，續購、其他群組保留及權益異動會改變版本，外店異動不影響 |
| 合成元件 RWD | 1366×900、1920×1080、1024×768、768×1024、390×844，三模組名單只顯示剩餘數字；詳情展開與鍵盤操作通過、無整頁水平溢出：[結果](applicable-balance-20261029/component-results.json) |

RWD 使用實際共用名單／餘額元件；音樂使用原名單 CSS 與餘額元件。25 筆合成名單、長方案名稱及詳情測試；不是登入後完整課表驗收。音樂保留原有局部水平捲動。可重跑 `node scripts/qa/applicable-balance-browser.mjs`。

- [桌機合成預覽](applicable-balance-20261029/desktop.png)
- [iPad 尺寸合成預覽](applicable-balance-20261029/ipad.png)

## 遠端隔離 Preview（2026-10-30 更新）

- URL：<https://steamfoot-booking-654m334bt-rock7652-2111s-projects.vercel.app>
- 部署 `dpl_DUtQQhxoV67VioW6tGnXWjjzsAct`，READY；受測應用程式 SHA `c3b51a7ba0bde06e5a51ae4ab8aa9e4da5f1f3a6`。
- 僅手動 Preview，省略 API target，回傳 target=null；未合併 main 或部署正式站。
- 分支限定的五個非機密設定：SPORTS_REDESIGN_STAGING=1、SPORTS_REDESIGN_PREVIEW=1、BEAUTY_MODULE_ENABLED=1、BEAUTY_DATABASE_MODE=legacy、BEAUTY_NOTIFICATIONS_ENABLED=0。
- 建置確認 `isolated_database=true migrations_skipped=true notifications_blocked=true`。未套用遷移。
- 修正音樂 Preview capability：僅本分支、指定 repo、VERCEL Preview、隔離雙連線、store-lubymusic 可用。拒絕外庫／混合連線／正式環境／其他店；不授權歷史資料匯入或 release。新增邊界回歸測試通過，tsc 通過。
- [本次完整 CI](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/40987762470)：Typecheck、ESLint、Targeted tests、Full Vitest baseline 全數通過；音樂補課與運動共用卡 PostgreSQL audit 另行通過。

## 正常登入的隔離系統驗收

使用者明確授權在 steamfoot-preview 三個既有隔離店建立 QA1469 合成帳號、學員、卡及預約；未修改既有業務資料。透過正常 OWNER 登入及原有 API，未偽造 session、關閉保護或使用正式資料。

| 檢查 | 運動／舞蹈 | 音樂 | 美業 |
| --- | --- | --- | --- |
| 正常登入 → 名單 API → 隔離資料 → UI | 通過 | 通過 | 通過 |
| 舊卡 1＋續購卡 20−已預約保留 1 | 剩餘 20 堂 | 剩餘 20 堂 | 剩餘 20 次 |
| 名單不顯示單卡餘額／保留／方案明細 | 通過 | 通過 | 通過 |
| 預約詳情展開兩張卡及保留來源 | 通過 | 通過 | 通過 |
| 點名後重新載入仍為 20 | 通過 | 通過 | 通過 |
| 恢復待點名／服務後重新載入仍為 20 | 通過 | 通過 | 通過 |
| 1366×900 桌機、1024×768／768×1024 iPad 尺寸 | 通過 | 通過 | 通過 |

[機器結果](applicable-balance-20261029/hosted-20261030/results.json)。截圖位於同目錄，含各模組 desktop、iPad 直向與預約詳情。

驗收後三個臨時 User 均 SUSPENDED、passwordHash=NULL，對應 Staff 均 INACTIVE；只處理本次 QA1469 ID。瀏覽器 context 已關閉，本機臨時密碼及含 hash 的 SQL 已移除。保留隔離合成交易供追溯。

## 驗收界線

- 前段合成元件預覽與本段「真實 Preview 系統＋合成資料」明確分列；兩者都不是銀百合正式資料的業務簽核。
- 本輪固定使用兩張有效方案卡的續購狀態；新增購課後自動刷新、點數與失效／跨店／權限邊界由既有服務／元件／政策回歸測試涵蓋，未將它們冒稱本輪 hosted 操作已實測。
- 音樂合成預約未建立完整歷史期別，初始畫面會提示「期別待確認」；本輪證明合計、點名、恢復及版面，不能代替真實期別歸屬驗收。原期別規則未修改。
- 實體 iPad／Safari 與真實店家業務驗收尚待完成。不得據此自動合併或上線。
- 本次未更改 LINE 或低額度提醒發送政策。
