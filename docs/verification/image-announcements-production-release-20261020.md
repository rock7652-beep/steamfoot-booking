# 圖片公告正式遷移流程與發布順序

## 實作及授權邊界

本次只補流程與驗證，**未連接正式資料庫、未設定部署環境變數、未合併或部署**。正式上線另需使用者授權。審閱支線的 hosted build／migration 阻擋仍保留。

`npm run build` 原有的 `scripts/ci-migrate.mjs` 新增唯一目標 `20261020100000_image_announcements`，委派 `scripts/image-announcements-production-migration.mjs`。沒有目標則維持不接資料庫；非 production 跳過；錯誤 project／connection 與 review branch 仍先拒絕。現有其他目標及其執行流程維持不變。

新目標需要既有正式環境／專案 allowlist、明確的 `PRODUCTION_MIGRATION_TARGET` 及檔案 SHA-256 驗證。執行時以直接連線交易持有專用 advisory lock；Prisma CLI 繼續負責真正的 `migrate status/deploy` 與 `_prisma_migrations`，不手工偽造或 resolve 紀錄。

- 首次：只接受這一筆待執行遷移、沒有未解決的失敗紀錄、兩張公告表及其物件尚不存在。任一不符即失敗，不執行 deploy。
- 完成：核對 status up-to-date、唯一已完成的有效 ledger checksum／step，以及兩表完整欄位、預設值、主鍵、Store 外鍵／cascade、索引、RLS、零政策、PUBLIC／anon／authenticated 無直接存取權。
- 重跑：只驗證一致性，保留已上傳圖片與 revision，不再次執行 deploy。發現漂移則失敗，不自動修復或刪除資料。
- 失敗：候選 migration 使用明確 `BEGIN/COMMIT`，DDL／RLS／撤權原子完成；失敗會回滾 DDL，但 Prisma 會留下失敗紀錄。後續自動重跑拒絕，需檢查原因後另行處理，不執行自動 resolve。

候選尚未部署，因此在原候選 migration 加上交易及 PUBLIC 撤權，未修改已部署歷史。新版 checksum：`eae83871df1395a42918bf55b28e1df6f6da11d8580cb4029d435494a5f0246f`。前幾輪本機 UI 驗收的 migration 證據屬於當時版本；此輪另驗新版精確 SQL 與遷移流程。

## 正式發布順序（尚未執行）

1. 確認候選 PR 的必要 CI 通過、正式分支及待發布內容，取得合併／發布授權。確認正式資料庫有可用備份／還原點，記下目前正常部署版本。
2. 由授權部署環境使用既有正式連線設定，將這次部署的 `PRODUCTION_MIGRATION_TARGET` 明確設定為 `20261020100000_image_announcements`；僅配置於這次正式發布，不配置至 Preview。不要覆蓋其他尚待處理任務的 target。
3. 透過既有正式發布流程執行 build。遷移會先於 Prisma client 生成與 Next build 執行。應看到 `image_announcements_preflight_verified` 及 `image_announcements_final_schema_verified`；重跑則為 `image_announcements_already_applied_verified`。既有 guard 可能先因環境／專案不符而停止。
4. 若發現其他 pending／failed migration、checksum 或 schema 不符，停止發布並單獨調查；不要改用無限制的 deploy、db push 或自動 resolve 繞過檢查。若正式 migration history 本來有未整理項目，這個目標會拒絕，不能保證目前正式 history 已可直接執行。
5. 遷移／編譯成功後才發布應用。依門市驗證後台圖片公告入口、前台空公告正常、測試公告可顯示／放大及上下架。真實 LINE SDK 登入及 App 內行為仍屬發布後需確認的項目，預覽驗收不能替代它。
6. 驗證完成後，移除這次 production migration target，讓後續無目標 build 回到不做資料庫工作的模式。

## 回退

若應用上線後有問題，回退至發布前正常版本，保留新增兩表及已上傳資料；本次只有新增表，舊版可忽略它們。不提供自動 DROP／逆向刪表，避免移除店家圖片。若遷移成功而編譯失敗，也保留表與 ledger；修正原因後同目標重跑會驗證已套用狀態。

若 DDL 失敗，先檢查失敗紀錄及表是否回滾，保持舊版運作；歷史修復及重新執行需具體調查，不在此流程自動處理。

## 演練與證據

在獨立 Docker PostgreSQL 16、loopback `127.0.0.1:55469/image_announcements_acceptance`，使用同一 production handler、真實 Prisma CLI 及精確候選 SQL。測試歷史只有最小 Store baseline 與候選遷移，**不是正式環境 migration history／連線 preflight**。不偽造正式環境 URL 或放寬 production guard。

9 個情境通過：首次建立與 fingerprint、重跑保留資料與 ledger、實際 anon/authenticated 拒絕、RLS/PUBLIC 漂移拒絕、併發 lock 拒絕、額外 pending 不執行、ledger checksum 漂移拒絕、部分表存在時拒絕、中途 DDL 失敗回滾及後續拒絕。

證據：`artifacts/image-announcements-migration-20261020/results.json`。重現：啟動空的一次性驗收 DB（**不要先 seed**），執行 `node scripts/qa/image-announcements-live.mjs migration`。runner 只接受專用本機 DB／origin，丟棄外部服務 credentials 且拒絕 dotenv；測試後清理專用容器。

Supabase 安全核對：僅改新增表 RLS／privileges，沒有前端金鑰、auth metadata、view、函式或 SECURITY DEFINER；API 公開圖片仍由應用檢查排程，沒有新增 Data API policy。技能建議的遠端 advisors 未執行，因未授權觸及正式環境；此處以本機實際角色查詢及 pg catalog 驗證。

## 程式檢查

遷移、既有 production／preview guard、公告相關 8 檔 51 項測試通過。TypeScript `tsc --noEmit`、變更檔案 ESLint、Node 腳本語法及 diff whitespace 檢查通過。驗收專用 PostgreSQL 容器已移除。
