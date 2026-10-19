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

部署 URL、READY 狀態及提交 SHA 待實際建立後補記。目前重新搜尋可用工具，仍沒有 Browser `js` 或 CUA 瀏覽器工具；沒有宣稱已連接或登入。

待驗後台 1440×900、iPad 1024×768／768×1024、會員手機 390×844 與面板 360px。依需求基準只補項目規則、兩種方案、無方案選單排課、報名、固定課點名、扣還點、更正及角色顯示。登入／尺寸驗收未完成，不以先前 238 項本機測試或本次 migration 成功代稱完整交付。
