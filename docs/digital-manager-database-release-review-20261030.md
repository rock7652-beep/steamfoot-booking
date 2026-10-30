# 數位店長資料庫變更：待審查清單

此文件與 SQL 為正式 migration 的審查材料，並未授權或執行正式資料庫變更。功能分支目前只允許指向指定隔離 Preview 資料庫，建置不執行 migration，且外部通知維持封鎖。

## 順序與校驗

| 順序 | 候選 SQL | SHA-256 |
| --- | --- | --- |
| 1 | `scripts/sql/digital-manager-notice-candidate.sql` | `b4c6c7103a121d75d2b90da813b7b2a00073d6c885f44a1a3fe7e37f0ff7af39` |
| 2 | `scripts/sql/steamfoot-digital-manager-booking-candidate.sql` | `eb1070ce4ae2714c08935800137ba8ed0b0c30f1c45cb4bbec17f92c855a289e` |
| 3 | `scripts/sql/steamfoot-digital-manager-payment-candidate.sql` | `bc8aaacdfbe33853e456bb04dab0c51f419df7cc7ab3f4555238df4c819f5796` |
| 4 | `scripts/sql/digital-manager-lead-candidate.sql` | `cf732d131b1f41cbc39933852530c326978ea1bf8283d0fbe50faed4cd762317` |
| 5 | `scripts/sql/digital-manager-vip-candidate.sql` | `85511aca1b164611970d12da72b58005c588dc2a8f56282a9d15dfe6caf324d3` |
| 6 | `scripts/sql/digital-manager-incomplete-resolution-candidate.sql` | `5b5a84e5c4d6ae1578c256f0c305d891ce7191cd505a66aa6226780c1598ed01` |
| 7 | `scripts/sql/digital-manager-beauty-access-candidate.sql` | `a4044529b0d4f48f268ca777a395471d5bc07e60eb3255f414c2c237eb2edf4f` |

1 必須先於 2–7；7 另需確認正式美業實際採用的受限 runtime role，不可猜測或以 postgres／anon／authenticated 取代。候選 SQL 須轉成符合現行 migration 流程的正式版本，並與實際部署 commit 一起審查。不得直接把本清單當成可執行正式發布腳本。

## 已驗與未驗

隔離資料庫已安裝 1–6 的候選結構；2 的更新已在隔離資料庫驗證，即使舊通知開關關閉也會產生當日預約提示，店員代建的當日預約亦列待處理；測試交易已回滾。7 已在本機隔離資料庫使用受限角色測試，並在 Preview 資料庫安裝至專用 NOLOGIN 測試角色；Preview 平台拒絕 `SET ROLE`，因此該角色的實際查寫仍未驗證，不能以本機結果替代。正式資料庫尚未套用 7。正式 schema、實際連線角色與授權、完整 migration／回滾演練仍待核對。

Preview 中的 `steamfoot_beauty_data_dmqa` 僅是無登入能力的測試角色；清理其政策與角色的工具要求返回 `Invalid or expired requestState`，目前仍保留，並未修改正式環境。重新清理前應核對角色仍無登入能力且政策僅屬於該角色。

2026-10-30 唯讀核對：正式資料庫已有 `steamfoot_beauty_prod_20261025` 受限登入角色，非 superuser、非 BYPASSRLS，具備 `Store.id` 與 `Store.industryModule` 欄位的 SELECT 權限；`Store` 啟用 RLS 且已有該角色的 SELECT policy。正式環境設定列出美業資料庫模式為 `dedicated`；尚須在發布前重新確認實際連線角色與政策及正式 schema 相符。正式資料庫尚無 `DigitalManagerNotice` 與 `DigitalManagerActivation` 表，故不得先部署本分支程式。

上線前須確認資料庫識別與備份、所有相依 migration、隔離演練與權限測試；先安裝並驗證資料庫，再部署相容的應用版本。候選 trigger 同交易寫入通知，缺少表或執行權限可能使預約、付款等業務操作失敗，禁止先上應用再補資料庫。回退時需保留既有預約、付款及通知紀錄，不以刪除業務資料作回滾。
