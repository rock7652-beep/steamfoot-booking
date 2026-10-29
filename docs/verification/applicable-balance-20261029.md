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

## 遠端隔離 Preview

- URL：<https://steamfoot-booking-jbtfcmchx-rock7652-2111s-projects.vercel.app>
- Vercel 原專案：`prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`；部署：`dpl_2ktJiuBcrpZnCeuW42Sge6NPXxTc`；狀態：READY。
- 受測應用程式提交：`92bed2007af5e60ecdb2c89f9aad7d21ad84bf45`（後續提交僅驗收證據、測試及 CI 清單）。
- 分支自動部署關閉；手動部署只使用 Preview。官方 POST `/v13/deployments` 規格：省略 target 預設 Preview；回傳 target=null。未使用 staging 共用別名或 production。
- 五個非機密設定只限本分支 Preview：SPORTS_REDESIGN_STAGING=1、SPORTS_REDESIGN_PREVIEW=1、BEAUTY_MODULE_ENABLED=1、BEAUTY_DATABASE_MODE=legacy、BEAUTY_NOTIFICATIONS_ENABLED=0。
- 建置記錄確認：`[sports-redesign-preview] isolated_database=true migrations_skipped=true notifications_blocked=true`。僅允許既有測試資料庫 `ttworfzgwejdeolegkxl`，未套用遷移或改動正式設定。

## 端到端驗收狀態與限制

流程：開啟名單 → 原授權 reader → 各模組權益／預約保留 → 共用合計 → 名單剩餘文字／預約詳情。

| 邊界 | 狀態 |
| --- | --- |
| 元件與合計呈現 | 合成資料／模擬回應驗證通過 |
| 遠端建置與隔離前置檢查 | READY，隔離與不遷移檢查通過 |
| 正常登入存取受保護部署 | 阻擋：Vercel CLI 65.7.0 回報 loggedIn=false；登入頁實測 HTTP 302 導向 vercel.com/sso-api |
| 登入後名單 API → 真實隔離資料 → UI | 尚未執行，不得宣稱通過 |
| 遠端登入後桌機／iPad 三模組操作 | 尚未執行，不以合成截圖代替 |
| 實體 iPad／Safari | 未驗 |

已請使用者完成此工作區正常 Vercel 登入或提供既有驗收入口，不索取 token、密碼或 cookie；未關閉部署保護、建立分享繞過連結、偽造 session 或使用正式資料完成測試。登入恢復後，需在隔離店逐模組核對 1+20−1=20、續購刷新、點名／恢復後不重扣、詳情來源、權限及桌機／iPad，再更新 PR 驗收狀態。本次不改 LINE 或低額度提醒發送政策。
