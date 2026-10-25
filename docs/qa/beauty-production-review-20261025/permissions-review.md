# Runtime 最小權限審查

後續已完成：採單一受限 LOGIN 角色，補上排序 INSERT／UPDATE、必要人員／使用者欄位、現金帳鎖列與共享欄位，加入非美業模組 restrictive RLS；本機 Postgres 17.6 的 63 項測試通過。詳見 [最新方案](RUNBOOK.md)。本文件下方保留舊候選的缺口分析，並非仍未收斂的同一項待辦。正式庫尚未建立角色或 GRANT。

這是權限需求，不是 GRANT 授權；不得為通過驗證向整個 User／Staff 表開放讀寫。

## 角色方式

`beauty-module-candidate.sql` 要求已存在的受限 LOGIN backend role；`beauty-data-role-candidate.sql` 建立的是 NOLOGIN NOINHERIT role。現行 `src/lib/beauty-db.ts` 與 database URL 選擇器以專用 URL 連線，沒有在每筆 transaction 自動切換到資料角色。兩者不能視為同一個方案。

候選正式方案須選定登入角色，確認沒有 superuser／BYPASSRLS／CREATEROLE／CREATEDB／schema ownership／危險角色繼承，再將必要操作明確授權。專用 URL 必須符合現行角色名稱與 TLS 驗證；不以 postgres 或 service_role 代替。

## 舊資料角色候選的具體缺口

| 程式來源 | 所需操作 | 舊候選缺口與收斂方向 |
| --- | --- | --- |
| `transaction-correction.ts` | Staff.id/storeId/userId/status 與 User.id/status；CashbookEntry 讀取並鎖列、插入沖銷；BeautyTransactionRevision 讀取／append | 未列 Staff／User／TransactionRevision；CashbookEntry 僅 INSERT，無 SELECT 與 FOR UPDATE 所需權限。需用實際角色測可用最小列／欄權限，不直接給全表 UPDATE |
| `roster-read.ts` | 依店與當頁顧客讀 Staff.id/displayName/status/storeId | 舊 shared_read 沒有 Staff；使用 column-level SELECT 並驗證 RLS，而非暴露全部人員資料 |
| `home.ts`／`native-schedule.ts` | JOIN User.id/status、Staff.id/displayName/storeId，判斷有效顧客／店長 | 舊 shared_read 沒有 User／Staff；不得授予密碼、驗證／連結 token 或其他不使用的欄位 |
| `queries.ts` | CourseDisplayOrder.storeId/kind/ids/revision SELECT | 舊 shared_read 沒有 CourseDisplayOrder，可能讓班表讀取失敗 |
| `store-notices.ts` | CourseStoreNotice 有 store-scoped upsert，讀既有欄位後更新 | 舊資料角色沒有此表；另一份 backend-notices 候選只 GRANT，仍需驗證實際角色的 RLS policy 與約束 |
| `commerce.ts` | CashDrawerSession SELECT、更新 updatedAt；CashbookEntry INSERT | 舊候選有部分權限，但須以開店／跨日／取消退款／交易沖銷完整測試，不只售卡成功 |

其餘共享表（Customer、CourseRoom、TrialBookingLink、BusinessHours、SpecialBusinessDay、SlotOverride、CourseRental、Store）保留既有功能要求，逐條與實際查詢比對，不能將此表當作完整白名單。主 Prisma client 的查詢與 Beauty client 的查詢要分別驗證。

## 財務與跨店邊界

- BeautyLedger、BeautyPayment、BeautySettlement、BeautyTransactionRevision 只允許讀與 append；不授予 UPDATE／DELETE／TRUNCATE，保留不可變 trigger。
- BeautyCommand 的 idempotency 與共享資源鎖仍需使用同一 runtime 角色驗證；不能以管理員測試代替。
- 公開／anon／authenticated 不得直接取得 Beauty 表存取。受信任後端仍須執行既有 storeId、顧客可見範圍及 requirePermission 檢查；RLS USING(true) 的 backend policy 本身不提供逐店隔離。
- 如新增 policy，先盤點正式共用表已有 policy／PUBLIC grants，精確增加必要權限，不覆蓋或刪除音樂／運動 policy。
- 必測：OWNER 正向操作、STAFF 無權限拒絕、跨店顧客／方案拒絕、兩次重送不多扣多退、現金抽屜交易原子性。

目前未建立角色、未 GRANT、未設定連線，沒有正式庫權限變更。
