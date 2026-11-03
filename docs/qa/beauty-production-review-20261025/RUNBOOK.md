# 正式升級候選包與執行關卡

2026-10-25：**本機 Postgres 17.6 首次安裝與權限驗證完成，63 項通過。正式庫尚未執行，正式發布仍需另行授權。**

這份文件取代本目錄最初只有 SQL 參考片段的狀態。`01-model.reference.sql`、`02-integrity.reference.sql` 仍故意禁止直接執行；新版候選為 `10`、`20`，不以移除 reference guard 的方式部署。

## 交付物與順序

| 階段 | 檔案 | 行為與停止條件 |
| --- | --- | --- |
| 前置唯讀 | `00-preflight.readonly.sql` | 確認 project／角色／14 表不存在、型別及共享依賴；部分安裝停止 |
| 結構 | `10-install.candidate.sql` | 同一 transaction 安裝完整 14 表、六欄、索引／外鍵／排斥、共卡與體驗限制、不可變交易 trigger、RLS；加入 BEAUTY enum；既有 Beauty 物件或函式即停止 |
| 角色與共享依賴 | `20-runtime-role.candidate.sql` | 同一 transaction 建立新的受限 LOGIN role、最小表／欄權限、restrictive RLS；精確擴充共享通知約束；同名角色／policy、缺少 RLS、PUBLIC 額外權限或通知約束漂移即停止 |
| 後置唯讀 | `30-postflight.readonly.sql` | 讀回角色能力、持有關係、RLS、權限與六欄型別／nullable／default |
| 校驗與重現 | `release-manifest.json`、兩支 `scripts/qa/*beauty-production-package.py` | 來源與候選 SHA256；builder 不連線資料庫，verifier 只操作固定名稱且 network=none 的本機 Docker 容器 |

每階段需 `ON_ERROR_STOP`，不能用忽略錯誤、IF NOT EXISTS 或重試覆蓋來完成部分安裝。`10`／`20` 各自 atomic，但**不是跨檔單一 transaction**：若 `10` 完成、`20` 停止，保留結構、維持模組與編輯關閉；核對原因與已安裝狀態後才處理 `20`，不得重跑 `10` 或刪表重建。

## 連線與明確確認值

正式 project 必須由外部控制工具核對為 `qijlnhtpbintanzpxkvf`，不得使用 Preview 專案。SQL 的 database 名稱不能證明 project 身分，因兩個專案都叫 `postgres`。

實際執行同一連線需明確設定三個 session 值：

- `beauty_release.review_id = beauty-production-20261025-v1`
- `beauty_release.expected_database = postgres`（本機測試專用值為 `beauty_release_qa`）
- `beauty_release.runtime_role =` 經核對的新 `steamfoot_beauty_*` 角色名稱；**不可填本機 qa 角色為正式值，也不可沿用 postgres／service_role**。

這些值是人工核對的停止閘，不構成授權或認證。正式執行仍需使用者確認精確變更包與部署。

## 已收斂的角色方案

採用**單一受限 LOGIN 角色直接授權**，符合現行 Beauty 專用 URL 連線方式。沒有建立第二個 NOLOGIN role，也沒有假設應用會自動 SET ROLE。角色無 INHERIT、superuser、BYPASSRLS、CREATEROLE、CREATEDB、REPLICATION、schema CREATE、表 ownership 或其他角色 membership。

SQL 不建立密碼。後續憑證只能走另外核准的安全配置管道，不寫入 Git、報告或指令輸出；正式 DSN 必須使用 TLS 並符合 `scripts/beauty-database-scope.mjs`。本機透過沒有對外連接埠的容器 Unix socket 驗證 LOGIN 身分與權限，**不是正式 TLS／pooler／秘密配置驗收**。

- BeautyLedger、BeautyPayment、BeautySettlement、BeautyCommand、BeautyTransactionRevision：SELECT／INSERT，沒有 UPDATE／DELETE／TRUNCATE；帳本／付款／結算／修訂另有不可變 trigger。
- User 僅 SELECT id／status；Staff 僅 id／storeId／userId／displayName／status。不可讀 passwordHash 或整張 User，不可寫 Staff。
- 共享顧客基本資料、位置租借欄位、顯示排序、通知 upsert 與已用到的現金帳欄位，依最新版 action/query 精確補齊。排序包含 INSERT／UPDATE，非只有讀取。
- Store／CashbookEntry 的 UPDATE(id) 只用來滿足 SELECT FOR UPDATE 所需 ACL；新角色專屬 trigger 禁止它實際 UPDATE，其他角色行為保留。
- CashDrawerSession 只能 UPDATE updatedAt 以同步交易鎖，不能修改現金金額或關帳欄位。

## 隔離邊界與共享影響

新角色的 restrictive RLS 阻擋非 BEAUTY 店的共享資料及寫入；即使共享表已有 permissive PUBLIC policy 仍不會放行。User 只可見美業 Staff／Customer 關聯的必要身分狀態。

這是**模組隔離，不是每位員工或每家美業店的身分授權**。受信任後端角色需能服務 HQ 下不同美業店；不同美業店之間仍由既有 `requirePermission`、beautyManager／beautyMember 與權威 storeId 檢查，跨店資料關聯另由 composite FK 阻擋。不得宣稱 RLS 已取代應用層 OWNER／STAFF／顧客權限。

共享通知只在確認舊約束精確相符後擴充：保留 BOOKING／LEAVE／CANCEL／MOVE／STOP／RESTORE，COMPLETE／NO_SHOW 只允許 `beauty:` subject。保留既有 policy、位置停用 guard 與其他模組的資料；不恢復 SPA。

## 驗證證據

[Postgres 63 項結果](../../beauty/evidence/20261025-production-package/postgres-results.json)包括：首次安裝、缺 marker／依賴停止、重跑停止、角色建立失敗回滾、實際 14 表欄位集合、公開角色拒絕、敏感欄位拒絕、基本資料與租借設定、排序寫入、鎖列、跨店 FK、時段衝突、共用卡、財務不可變、command receipt 保護及原六種課程通知保留。

正式庫只查 metadata：server_version=17.6；所列 14 張共享表 RLS 已開；角色方案明列的 64 個共享欄位全存在，通知舊約束相符。[唯讀證據](../../beauty/evidence/20261025-production-package/production-metadata-readonly.json)。不等於正式憑證、全部既有 policy 組合或真實營運交易都已驗收。

本機 fixture 從主／課程 Prisma 模型產生，並建立必要 RLS／位置 guard，**不是正式資料庫完整複本**。最終測試沒有 page/browser 部分；前輪隔離站 UI、現金、OWNER／STAFF／跨店證據另見 [現金驗收](../../beauty/cash-acceptance-20261025.md) 與 [整合驗收](../../beauty/hosted-integration-acceptance-20261025.md)。

## 正式執行前仍需完成

1. 核對正式庫最新成功備份時間、回復權限與步驟。Preview 備份不能替代；Storage 物件另算。整庫還原會影響音樂／運動在備份後的交易，不當成快捷回退。
2. 確認正式目標 Store ID、HQ 綁定與啟用方式；本包不新增店、不將測試店資料搬入正式、不修改現有店的 industryModule。
3. 安全配置新的 runtime 憑證，檢查正式 TLS／pooler／連線與整合部署環境；先維持 BEAUTY_MODULE_ENABLED=0、通知=0，完成結構與 postflight 後才考慮啟用。收費 allowlist 需填正式目標店。
4. 正式升級與發布授權，再按階段執行；建置不得偷偷套 migration。執行後，以正式 runtime 連線做 metadata／零寫入查詢核對，不冒用管理角色結果。

## 回退原則

優先關閉新入口／收費編輯，保留 schema、快照及交易記錄；不 DROP 新欄位／表，不以舊程式忽略既有收費快照，不刪卡或帳本，不恢復 SPA。若 `20` 交易失敗，該階段角色／policy／通知約束更動會一併回滾；已提交的 `10` 結構保留等待核對。

不得自動 revoke 正式 runtime、撤銷共享 policy 或刪角色來回退：已有業務連線時可能中斷營運，須另行確認。
