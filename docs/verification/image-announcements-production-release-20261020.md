# 圖片公告：單筆正式遷移與發布順序

## 結論與邊界

圖片公告改用封閉的單筆 Prisma 遷移目錄，可在正式庫既有 23 筆遷移缺少完成紀錄的情況下，只套用 `20261020100000_image_announcements`。不執行、修復或 resolve 那 23 筆歷史；不要求全 repository 的 migrate status 變成 up-to-date。

此次僅改程式並在本機演練。先前對正式庫只做唯讀檢查：專案健康、公告兩表不存在、122 筆已完成紀錄與 repository 的 checksum 相符、沒有未解決的失敗紀錄；146 個 repository 遷移中有 24 筆缺少完成紀錄，其中一筆為本次公告。這不能解讀為其餘 23 筆 SQL 都未曾透過其他方式執行。

**尚未修改正式資料庫、部署設定、合併或部署；備份／還原點尚未由現有工具確認。** 真正 LINE SDK／App 登入仍未實測。實際正式發布前須確認當時 CI、正常部署版本與備份，並取得發布授權。

## 實作

`npm run build` 既有 `scripts/ci-migrate.mjs` 目標為 `20261020100000_image_announcements`，委派 `scripts/image-announcements-production-migration.mjs`。沒有目標不接資料庫；非 production 跳過；production 專案、連線及 review branch 限制維持原規則，其他 migration target 的行為不變。

執行新目標時：

1. 驗證候選檔 SHA-256，取得專用 transaction advisory lock；有任何未解決的 Prisma 失敗紀錄即拒絕。
2. 若該目標已完成，核對 checksum／steps、schema／RLS／權限後返回，不執行 CLI，不改已上傳資料。既有紀錄與 schema 不一致時拒絕。
3. 首次必須沒有本目標紀錄、公告表或同名物件。對其他 `_prisma_migrations` 完整列（包含 checksum、時間、logs、steps）計算 fingerprint。
4. 在系統臨時目錄建立只含精確候選 SQL、migration_lock.toml 與 datasource schema 的目錄。schema 使用既有受保護的 `DIRECT_URL`，不含連線值。Prisma 只執行 `migrate deploy --schema <臨時schema>`；目錄內沒有其他 migration，故不會補跑既有 23 筆。
5. Prisma CLI 真正執行 SQL 及記錄自己的 ledger；不手工插入／標記 migration 完成。公告 SQL 以 `BEGIN/COMMIT` 原子建立表、RLS 及撤權。
6. 完成後核對唯一有效本目標紀錄、欄位／預設值、主鍵、Store 外鍵與 cascade、索引、RLS、零政策及 PUBLIC／anon／authenticated 無直接存取權；確認其他 migration fingerprint 完全不變。臨時目錄在成功或失敗時均清除。

成功事件為 `image_announcements_preflight_verified`、`image_announcements_unrelated_history_unchanged`、`image_announcements_final_schema_verified`；重跑為 `image_announcements_already_applied_verified`。其他失敗只記固定錯誤代碼，不輸出連線值。若 SQL 中途失敗，兩表回滾，Prisma 留下失敗紀錄；後續自動重跑拒絕，不做自動 resolve。

SQL checksum：`eae83871df1395a42918bf55b28e1df6f6da11d8580cb4029d435494a5f0246f`。此輪 SQL 與前一輪相同，只改成封閉單筆交付方式。更早 UI 驗收的 SQL 屬當時候選版，不能取代此輪遷移演練。

## 正式發布順序（尚未執行）

1. 核對本 PR 最新 CI、待發布 commit、正式資料庫備份／還原點及目前正常部署，取得使用者的正式發布授權。
2. 在授權的 production 發布環境配置 `PRODUCTION_MIGRATION_TARGET=20261020100000_image_announcements`，使用既有正式連線；不要配置至 Preview 或覆蓋其他任務的 migration target。合併會觸發自動部署，必須將 target 設定與該次正式發布一併安排，不能只合併後才補表。
3. 執行既有正式 build／發布。遷移先於 client 生成及 Next build。既有 23 筆 pending 不阻擋本目標，也不應變成 applied；本次只新增公告表與它的 Prisma ledger。
4. 若出現失敗紀錄、checksum／schema 漂移、鎖取得失敗或其他歷史被改動，停止發布，調查具體原因，不使用全目錄 deploy、db push 或 resolve 繞過檢查。
5. 遷移／編譯完成後發布應用，核對三模組的圖片公告後台入口、空公告首頁、有效公告輪播／放大及排程。LINE App 的裝置行為與登入另作實測，不宣稱預覽已涵蓋 SDK。
6. 完成後移除該次 production target，讓後續無目標 build 保持不操作資料庫。

## 回退

應用有問題時回退至發布前正常版本，保留新增兩表、圖片及 ledger；舊版可以忽略新增表。本流程不提供自動 DROP 或刪除圖片。

若遷移已完成但編譯失敗，舊版仍可運作；排除原因後，同目標重跑會驗證已套用狀態，不重建資料。DDL 失敗則先確認 rollback 與 Prisma 失敗紀錄，再另行調查及處理；不自動 resolve。

## 驗證與重現

證據：`artifacts/image-announcements-targeted-release-20261020/results.json`。使用 PostgreSQL 17（與正式庫相同 major）、真實 Prisma CLI、真正 production handler、精確候選 SQL、一筆已完成 baseline，以及正式庫缺紀錄的 23 個歷史 migration 名稱。這 23 個 SQL 在測試目錄改放會修改 sentinel 的測試 SQL，用來證明沒有執行；不是正式資料庫或資料內容的複製。

10 個情境通過：首次僅執行公告、重跑保留圖片與 ledger、實際 anon/authenticated 拒絕、RLS/PUBLIC 漂移拒絕、併發鎖拒絕、23 筆歷史維持 pending 且其他資料／完整 ledger 不變、未解決失敗歷史仍拒絕、目標 checksum 漂移拒絕、部分表存在拒絕、中途 DDL 失敗整體 rollback 及拒絕重跑。

重現：啟動空的一次性 loopback PostgreSQL（`127.0.0.1:55469/image_announcements_acceptance`，不要先 seed），執行 `node scripts/qa/image-announcements-live.mjs migration`。runner 只傳本機必要環境、拒絕 dotenv，且不接受遠端 DB／hosted metadata。測試後移除專用容器。

前輪採全目錄 status 的 9 情境報告 `artifacts/image-announcements-migration-20261020/` 保留作歷史；它被本輪封閉單筆流程取代，不能用作目前 pending 策略的依據。

Supabase 安全核對：本目標僅新增兩表、RLS／撤權，沒有新增 Data API policy、前端 secret、view 或 SECURITY DEFINER。使用真實角色及 pg catalog 驗證；沒有操作正式環境 advisors 或備份。

## 程式檢查

相關 8 檔 52 項回歸、TypeScript `tsc --noEmit`、變更檔 ESLint 與腳本語法／diff 檢查通過。本機專用 PostgreSQL 17 容器已清理，其他工作目錄未修改。
