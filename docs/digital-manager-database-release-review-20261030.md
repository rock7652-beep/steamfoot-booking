# 數位店長資料庫變更：待審查清單

此文件與 SQL 為正式 migration 的審查材料，並未授權或執行正式資料庫變更。功能分支目前只允許指向指定隔離 Preview 資料庫，建置不執行 migration，且外部通知維持封鎖。

## 順序與校驗

| 順序 | 候選 SQL | SHA-256 |
| --- | --- | --- |
| 1 | `scripts/sql/digital-manager-notice-candidate.sql` | `b4c6c7103a121d75d2b90da813b7b2a00073d6c885f44a1a3fe7e37f0ff7af39` |
| 2 | `scripts/sql/steamfoot-digital-manager-booking-candidate.sql` | `adf0b38d3f298b92b3462c0d781c36aad7d9fb3e3f8415ce0500d9e481893850` |
| 3 | `scripts/sql/steamfoot-digital-manager-payment-candidate.sql` | `bc8aaacdfbe33853e456bb04dab0c51f419df7cc7ab3f4555238df4c819f5796` |
| 4 | `scripts/sql/digital-manager-lead-candidate.sql` | `cf732d131b1f41cbc39933852530c326978ea1bf8283d0fbe50faed4cd762317` |
| 5 | `scripts/sql/digital-manager-vip-candidate.sql` | `85511aca1b164611970d12da72b58005c588dc2a8f56282a9d15dfe6caf324d3` |
| 6 | `scripts/sql/digital-manager-incomplete-resolution-candidate.sql` | `5b5a84e5c4d6ae1578c256f0c305d891ce7191cd505a66aa6226780c1598ed01` |
| 7 | `scripts/sql/digital-manager-beauty-access-candidate.sql` | `a4044529b0d4f48f268ca777a395471d5bc07e60eb3255f414c2c237eb2edf4f` |

1 必須先於 2–7；7 另需確認正式美業實際採用的受限 runtime role，不可猜測或以 postgres／anon／authenticated 取代。候選 SQL 須轉成符合現行 migration 流程的正式版本，並與實際部署 commit 一起審查。不得直接把本清單當成可執行正式發布腳本。

已產生 `prisma/reconciliation/20261030_digital_manager_migration_review.sql`，依序合併 1–6 並包在同一交易內，SHA-256 為 `4d6f2db1fff1feabbc42f39c2b5060df8d02a4e4f658345d6f5f810aed74d129`。它是審查稿，刻意不放入自動 migration 目錄，也不包含需指定受限角色的 7。現有正式發布流程有 migration 目標白名單與安全檢查；尚未將此稿註冊為正式 migration 或加入可執行的發布目標，不可跳過這些檢查。上線前仍須確定實際 migration 帳本、相依項、角色與備份，建立並驗證符合現行流程的版本。

## 已驗與未驗

隔離資料庫已安裝 1–6 的候選結構；2 的更新已在隔離資料庫驗證，即使舊通知開關關閉也會產生當日預約提示，店員代建的當日預約已依新決策調整為不建立預約通知；隔離資料庫以交易確認顧客當日預約仍列待處理、店員代建沒有通知，交易已回滾；測試交易已回滾。7 已在本機隔離資料庫使用受限角色測試，並在 Preview 資料庫安裝至專用 NOLOGIN 測試角色；Preview 平台拒絕 `SET ROLE`，因此該角色的實際查寫仍未驗證，不能以本機結果替代。正式資料庫尚未套用 7。正式 schema、實際連線角色與授權、完整 migration／回滾演練仍待核對。

審查稿已在本機 PGlite 合成 schema 上完整安裝兩次，確認新 trigger 數量、檔案內容與六份候選一致；移除必要資料表時，確認整批交易回滾。這不是正式資料庫副本或正式 Prisma migration 的完整部署／回滾演練。受限角色本機測試另確認可處理美業通知及啟用紀錄，禁止修改 targetId、寫入不相符事件類型、刪除通知及跨模組寫入。

補充真實 PostgreSQL 16 本機演練：在全新專用隔離資料庫建立獨立 LOGIN、非 superuser、非 BYPASSRLS 角色，安裝候選 1、7 並重新執行確認可重複。以該角色真實登入，確認三種美業事件的新增、去重、處理、啟用紀錄與限定門市查詢；跨業態寫入、事件類型不符、刪除和修改受限欄位均遭拒絕。另透過該角色的 Beauty Prisma 連線實際執行 `recordDigitalManagerNotice`／`resolveDigitalManagerNotice` 成功。腳本為 `scripts/qa/beauty-digital-manager-role-postgres.mjs` 及 `scripts/qa/beauty-digital-manager-role-service.ts`；前者只接受指定本機空資料庫及未使用角色。這仍不是正式角色的登入驗證或完整正式環境演練。

此共用角色的 RLS 限制美業範圍，但不單獨區分不同美業門市；必須由每個伺服器操作核實使用者及目前門市並限定查詢。`beauty-combined-notices.test.ts` 有本店資料與跨店拒絕的應用層測試；上線前仍須以正式設定驗證實際連線角色與端到端跨店隔離。

Preview 中的 `steamfoot_beauty_data_dmqa` 僅是無登入能力的測試角色；清理其政策與角色的工具要求返回 `Invalid or expired requestState`，目前仍保留，並未修改正式環境。重新清理前應核對角色仍無登入能力且政策僅屬於該角色。

2026-10-30 唯讀核對：正式資料庫已有 `steamfoot_beauty_prod_20261025` 受限登入角色，非 superuser、非 BYPASSRLS，具備 `Store.id` 與 `Store.industryModule` 欄位的 SELECT 權限；`Store` 啟用 RLS 且已有該角色的 SELECT policy。正式環境設定列出美業資料庫模式為 `dedicated`；尚須在發布前重新確認實際連線角色與政策及正式 schema 相符。正式資料庫尚無 `DigitalManagerNotice` 與 `DigitalManagerActivation` 表，故不得先部署本分支程式。

同日重新唯讀核對：該角色沒有整張 `Store` 表的 SELECT，兩個必要欄位均有 SELECT；既有 `Store` 對該角色有多項 SELECT／ALL 政策，包含 `true` 條件，不能假定 `Store` 的 RLS 本身只回傳美業門市。候選通知政策另外明確限制 `industryModule = 'BEAUTY'`；實際應用操作仍須驗證登入角色與門市邊界。

上線前須確認資料庫識別與備份、所有相依 migration、隔離演練與權限測試；先安裝並驗證資料庫，再部署相容的應用版本。候選 trigger 同交易寫入通知，缺少表或執行權限可能使預約、付款等業務操作失敗，禁止先上應用再補資料庫。回退時需保留既有預約、付款及通知紀錄，不以刪除業務資料作回滾。
