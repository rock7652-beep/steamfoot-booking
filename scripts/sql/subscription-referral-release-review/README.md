# 推薦五表：正式安裝審查包

狀態：審查完成稿，尚未取得正式 DDL 安裝授權，未安裝或啟用。既有核准只涵蓋診斷 PR 與唯讀檢查。

本包只新增五張私有表及其約束／索引，開啟 RLS，撤回 PUBLIC、anon、authenticated、service_role 權限。沒有既有業務表 DML、角色建立、GRANT、公開 RPC、排程、活動旗標或通知／金流變更。正式 runtime 是否與 GitHub 使用同一角色仍須另外核實；成功安裝不代表正式活動可用。

## 固定來源與單筆安裝範圍

- 唯一 SQL 來源：[subscription-referral-schema.sql](../../../docs/marketing/subscription-referral-schema.sql)。本目錄不再複製另一份 SQL。
- migration 名稱：`20261104235300_subscription_referral_private_core`。
- SQL SHA256：`9280d0494060f1e3cbff109bac26693868127b2e9c958cbe74600eccda5a1fd3`。
- [manifest.json](manifest.json) 固定 SQL 來源、checksum、五表及 API 拒絕角色；同時列出安裝前／後檢查稿的 checksum。
- 本包未加入 `prisma/migrations`、CI 安裝 dispatcher 或正式部署 workflow，不會因 push 自動安裝。

目前本機 161 筆 Prisma migration 與正式已完成帳本 138 筆相比，有 24 筆本機名稱未記錄、1 筆正式名稱不在本機；正式沒有未解決的 failed migration。這只是名稱比對，不能判定對應 DDL 尚未以其他方式套用。**不得從原儲存庫直接跑整批 migrate deploy，也不替這 24 筆執行 resolve。** 比對證據：[migration-ledger-comparison.json](../../../artifacts/subscription-referral-management/migration-ledger-comparison.json)。

下列指令只在全新暫存目錄產生一筆 migration 與專用 schema，不載入 `.env`、不連資料庫、不呼叫 Prisma、不覆寫既有 migration：

```sh
node scripts/stage-subscription-referral-migration.mjs --stage
```

正式核准後，才可由受保護環境對**這份產生目錄的 schema**執行 `prisma migrate deploy --schema <產生目錄>/schema.prisma`。必須先核對 manifest／產出 SQL checksum、migration 目錄只有這一筆及 provider lock，不得替換成原 repo schema。不建立或修改既有帳本記錄來隱藏歷史差異。

## 正式執行前必須通過的檢查

1. 重新核對精確核准的 Git commit、上述 SQL checksum、正式 project `qijlnhtpbintanzpxkvf`，與現存受保護連線。不輸出連線值或密碼，不從聊天貼入憑證。
2. GitHub DATABASE_URL 已用官方固定指紋 CA 成功唯讀登入 postgres；這不證明 DIRECT_URL 或 Vercel 主連線身份。安裝用連線仍須核實目標、角色、完整憑證／主機驗證與可用的 session/direct 連線；不降級 TLS，也不變更現有角色權限來通過。
3. 對安裝連線以 `BEGIN READ ONLY` 執行 [preflight.sql](preflight.sql)，再 `ROLLBACK`。需確認五表全不存在、父表欄位型別符合、可建立 schema 物件及 REFERENCES、failed migration 為 0。五表任何一張已存在即停止，不用 IF NOT EXISTS 靜默略過。
4. 核對 Store、StoreSubscription、ConsultationLead 的 text 主鍵及既有約束。新 RESTRICT 外鍵會阻擋有推薦紀錄的父資料刪除；保留既有封存／稽核方式，不新增 cascade 或刪紀錄的後門。
5. 保留活動關閉，確認實際已部署的旗標狀態。安裝本身不建立任何推薦碼、關係、收款或獎勵，也不改任何帳戶到期日。既有備份／還原安排依專案正式發版規範核對，本包不購買或重設備份服務。

## 核准後的單次安裝與驗證順序

1. 固定核准來源並生成單筆暫存 migration，前述檢查全部通過後才用 Prisma migrate deploy。SQL 以單一交易執行，lock timeout 3 秒、statement timeout 30 秒；遇既有鎖不調高 timeout 強推。
2. 成功後在新的唯讀交易執行 [postflight.sql](postflight.sql)。需有五張表、全部 RLS、5 個 PK／11 個 FK／9 個 UNIQUE、PUBLIC 與 API 角色無權限、帳本 finished 且 checksum 符合。再確認新五表皆空、沒有本次業務 DML。
3. 重新核對既有 migration 帳本沒有被 resolve／修改；只新增本次成功紀錄。若業務同時有正常操作，不把其他合法的資料變動誤當安裝副作用，也不自動回復那些資料。
4. 保留安裝來源 SHA、執行 ID、安全的前後檢查與 checksum。**這一步到此結束；Vercel runtime 權限、真實登入、總部人工扣款安排、功能啟用與官網發布是後續獨立驗收。**

## 停止與回復

- checksum、角色、project、欄位、既有表、鎖、權限或帳本任何一項不符即停止，不擴權、不重設密碼、不重新命名既有表來繞過。
- DDL 中途失敗，交易回復；Prisma 可能留下 failed migration 紀錄，保留診斷，不能盲目重跑、resolve 或把其他既有 migration 標成已完成。
- 若表已建立但最後帳本寫入異常，也先停止核對，不假定所有狀態都已回復。
- 安裝成功但應用驗收未過，保持活動關閉並保留表／資料。沒有自動 DROP 或縮短已承諾期限的 rollback 腳本。

## 已完成的隔離驗證

使用官方 PostgreSQL 17 映像（digest 與實際版本在證據 JSON），容器 `--network none`、無發布埠、只用臨時 Unix socket。合成父表保留使用欄位的正式型別，尤其既有日期為 timestamp without time zone；不複製正式資料或憑證。

```sh
node --test scripts/qa/subscription-referral-staging.test.mjs
node --import tsx scripts/qa/subscription-referral-installation-rehearsal.mjs --rehearse
```

- Prisma 實際只套用一筆 migration，保留既有合成業務資料與不同來源的歷史帳本；第二次 deploy 不重複套用。
- 安裝前／後唯讀 SQL 可執行，表、約束、權限與帳本 checksum 符合。
- 即使預設授權 ALL 給三種 API 角色，安裝後仍全部撤回；含 BYPASSRLS 的 service_role 也無法讀取推薦表。
- 實際 repository 在雙連線下重送領碼、綁定、建立雙方獎勵及發放，不重複加天或寫稽核。
- 月繳缺扣款證據被拒絕，稽核失敗使 Store、StoreSubscription 及獎勵完整回復。
- 中途名稱衝突使先前 DDL 回復，既有衝突表及 failed ledger 留供審查。

證據：[installation-rehearsal.json](../../../artifacts/subscription-referral-management/installation-rehearsal.json)。這不是完整正式 schema／trigger 重播、壓力測試或真實登入／金流驗收。未安裝正式資料庫。
