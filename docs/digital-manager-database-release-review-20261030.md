# 數位店長資料庫變更：待審查清單

此文件與 SQL 為正式 migration 的審查材料，並未授權或執行正式資料庫變更。功能分支目前只允許指向指定隔離 Preview 資料庫，建置不執行 migration，且外部通知維持封鎖。

## 順序與校驗

| 順序 | 候選 SQL | SHA-256 |
| --- | --- | --- |
| 1 | `scripts/sql/digital-manager-notice-candidate.sql` | `b4c6c7103a121d75d2b90da813b7b2a00073d6c885f44a1a3fe7e37f0ff7af39` |
| 2 | `scripts/sql/steamfoot-digital-manager-booking-candidate.sql` | `1d0e1e16a11aa5f40f1add6b70ed8241dc2ae1209e033e8f6bd35a0c9c52fb57` |
| 3 | `scripts/sql/steamfoot-digital-manager-payment-candidate.sql` | `bc8aaacdfbe33853e456bb04dab0c51f419df7cc7ab3f4555238df4c819f5796` |
| 4 | `scripts/sql/digital-manager-lead-candidate.sql` | `cf732d131b1f41cbc39933852530c326978ea1bf8283d0fbe50faed4cd762317` |
| 5 | `scripts/sql/digital-manager-vip-candidate.sql` | `85511aca1b164611970d12da72b58005c588dc2a8f56282a9d15dfe6caf324d3` |
| 6 | `scripts/sql/digital-manager-incomplete-resolution-candidate.sql` | `5b5a84e5c4d6ae1578c256f0c305d891ce7191cd505a66aa6226780c1598ed01` |
| 7 | `scripts/sql/digital-manager-beauty-access-candidate.sql` | `57dabd8a890103632a37c9029632bbab01e3381b466ab0abd7bc53e62af4e11f` |

1 必須先於 2–7；7 另需確認正式美業實際採用的受限 runtime role，不可猜測或以 postgres／anon／authenticated 取代。候選 SQL 須轉成符合現行 migration 流程的正式版本，並與實際部署 commit 一起審查。不得直接把本清單當成可執行正式發布腳本。

## 已驗與未驗

隔離資料庫已安裝 1–6 的候選結構；2 的更新已在隔離資料庫驗證，即使舊通知開關關閉也會產生當日預約提示，測試交易已回滾。7 只在本機隔離資料庫角色測試過，尚未套用到 Preview 或正式環境。正式資料庫 schema、現有角色與授權、完整 migration／回滾演練仍待核對。

上線前須確認資料庫識別與備份、所有相依 migration、隔離演練與權限測試；先安裝並驗證資料庫，再部署相容的應用版本。候選 trigger 同交易寫入通知，缺少表或執行權限可能使預約、付款等業務操作失敗，禁止先上應用再補資料庫。回退時需保留既有預約、付款及通知紀錄，不以刪除業務資料作回滾。
