# 運動課卡模式隔離 Preview

僅建立功能分支 Preview；不合併 main、不正式部署、不操作正式顧客資料。功能與本機驗證見 `sports-card-modes-implementation-20261020.md`。

## 已確認目標

- Vercel team `team_IAPnhzLHM4x540wiXg3lTyS9`，專案 `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`（steamfoot-booking）。
- GitHub `rock7652-beep/steamfoot-booking`，分支 `fix/sports-item-and-universal-cards-20261020`，不更改正式網域。
- Supabase 僅操作 `ttworfzgwejdeolegkxl`（steamfoot-preview）。正式 `qijlnhtpbintanzpxkvf` 未執行 SQL 或 migration。
- 既有合成驗收店 `sports-live-flow-store`／`sports-live-flow` 存在；合成老闆及會員連結存在，沒有重設帳密或複製正式帳號。

## 欄位候選安裝

已在上述隔離專案成功套用單份 migration `sports_card_modes_entitlement_fields_20261020`。SQL 來源為 `scripts/sql/sports-entitlement-candidate.sql`，SHA-256：

`e4f8182d936036b519d44f50d16f11bd69d70840058562b77f8419ec7aa4ca33`

安裝後九個欄位與三個 validated CHECK 均存在。三張表維持 RLS；anon／authenticated 沒有 SELECT／INSERT／UPDATE／DELETE 存取。沒有授權新角色或執行其他 migration。

| 摘要 | 安裝前 | 安裝後 |
| --- | ---: | ---: |
| 課卡筆數 | 239 | 239 |
| remaining 合計 | 1326 | 1326 |
| 點數紀錄筆數 | 931 | 931 |
| 紀錄 points 合計 | 2459 | 2459 |
| 預約筆數 | 12919 | 12919 |

這是隔離環境摘要，不包含顧客明細，不能代替正式角色或正式 schema 驗證。

## 部署限制與增量驗收

新增精確分支 allowlist，沿用既有 sports Preview 守衛：只允許 Vercel preview、正確 repository、隔離 DATABASE_URL／DIRECT_URL 與明確兩個 sports opt-in；正式目標或錯誤連線立即拒絕。自動 migration 仍跳過，對外通知沿用 Preview 阻擋。守衛相關 4 檔 89 項測試通過。

部署已 READY，ID `dpl_FCrcD93wr5ikxA9rpiGjNgr8u9mc`，target 為 Preview（API target=null），框架 Next.js 16.2.2，建置約 3 分 37 秒。

- 提交：`ad43c5d8e42ff00890c4275296308491ca9b3e09`，與遠端功能分支一致。
- Preview：`https://steamfoot-booking-pbgx080h8-rock7652-2111s-projects.vercel.app`。
- 後台：`/hq/login?store=sports-live-flow`；會員：`/s/sports-live-flow/book`。
- 建置日誌確認 `[sports-redesign-preview] isolated_database=true migrations_skipped=true notifications_blocked=true`，編譯與建置型別檢查成功。
- 隔離 migration history 版本：`20261019234358`；未補跑其他 migration。
- 只為本分支新增 Preview 範圍的 SPORTS_REDESIGN_STAGING=1、SPORTS_REDESIGN_PREVIEW=1、AUTH_TRUST_HOST=true；未讀出、替換或變更正式憑證。
- Draft PR：`https://github.com/rock7652-beep/steamfoot-booking/pull/1366`，未合併。

READY 後兩個入口的只讀 HTTP 檢查皆為 302 至 `vercel.com/sso-api`。此前建置期間的 200 是 Vercel 建置占位頁，未列為應用程式健康或登入證據。SSO 保護沒有停用，亦未索取 bypass secret。

目前重新搜尋可用工具，仍沒有 Browser `js` 或 CUA 瀏覽器工具；沒有宣稱已連接或登入。已詢問是否能在具備瀏覽器的工作階段接續，部署與資料庫工作不因此停止。

待驗後台 1440×900、iPad 1024×768／768×1024、會員手機 390×844 與面板 360px。依需求基準只補項目規則、兩種方案、無方案選單排課、報名、固定課點名、扣還點、更正及角色顯示。登入／尺寸驗收未完成，不以先前 238 項本機測試或本次 migration 成功代稱完整交付。

最小補驗順序：合成老闆登入 → 同項目建立兩種指定方案及通用卡 → 設定兩個項目的教練與開放課扣點 → 指定課不選方案排課、點名依各自購入規則扣抵 → 合成會員以同卡報名兩項開放課 → 阻擋兩種權益混用 → 取消／更正與重送核對原數量 → 檢查三種尺寸的操作、返回與角色顯示。只新增本輪合成測試資料，不重設既有驗收資料。

## CI 補充

首次完整 CI 的 25 個失敗集中於兩份既有測試的課卡欄位及查詢 mock 缺漏；補齊 unit、templateIds、requestKey、到期日及教學項目查詢後，兩檔 57 項回歸均通過。此次只修測試資料，不變更已部署的業務程式。完整 CI 待後續提交確認。
