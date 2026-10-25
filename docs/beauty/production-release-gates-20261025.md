# 正式發布下一階段核對（2026-10-25）

本輪只做正式庫 metadata SELECT 及本機候選檔案審查，沒有 DDL、資料寫入、環境修改或部署。上一輪隔離站結果見 [驗收報告](hosted-integration-acceptance-20261025.md)。

## 重新確認的正式庫缺口

目標 project `qijlnhtpbintanzpxkvf`，database `postgres`。查詢 pg_class、pg_enum、pg_roles，沒有查顧客個資。

```json
{"beautyTables":[],"industryEnum":["STEAMFOOT","SPA","COURSE"],"beautyRoles":[]}
```

因此不能只部署測試版程式或執行六欄 SQL；缺的是美業完整安裝。這不代表音樂／運動資料需要重建。

## 必須先收斂的安裝依賴

| 順序 | 審查來源 | 發布前缺口 |
| --- | --- | --- |
| 1 | `scripts/sql/beauty-module-candidate.sql` | 13 張基礎表、enum、跨店外鍵、資源排斥、帳本保護、RLS。要求已存在且受限的 LOGIN backend role；正式庫目前沒有可對應的美業角色 |
| 2 | companion／trial-duration／plan-care／reminder-settings 與 shared-* 候選 | 對照最新版 `beauty-prisma/schema.prisma` 逐欄列出必要增量；包含共用欄位、位置、技師、營業、通知等依賴，不能只套基礎表 |
| 3 | `beauty-native-transaction-candidate.sql` | 第 14 張 BeautyTransactionRevision，append-only trigger、RLS、角色讀／寫入；候選標頭限定隔離庫，不能原樣當正式授權 |
| 4 | `beauty-data-role-candidate.sql` | 建立的是新 NOLOGIN 資料角色，並非第 1 步要求的 LOGIN 身分；列出的 Beauty 表也未含 TransactionRevision。須一起審查角色連接、角色切換及最小權限，不能以執行檔案順序解決 |
| 5 | `beauty-backend-notices-candidate.sql`、shared-rental-access | 涉及共用 CourseStoreNotice 約束／CourseRental 讀取；需核對正式音樂／運動所有既有值、角色與 RLS，不能整表覆蓋權限或忽略共享影響 |
| 6 | `docs/qa/sql/beauty-charge-additive.review.sql` | 全部基礎依賴確認後才新增六欄；不得為重跑方便掩蓋部分安裝或型別差異 |

這是候選依賴審查清單，**尚不是可執行的正式 SQL 包**。Preview installer 明確綁定隔離專案及 legacy 連線，不挪用為正式 installer。

## 環境接點

- `scripts/beauty-database-scope.mjs`：正式 dedicated 模式要求專用 `steamfoot_beauty_*` 連線、TLS、與主連線相同 database path 且不同使用者；秘密不得寫入報告。角色實際存在／權限及連線成功須另驗。
- 先準備連線與所有必需欄位，再部署產生相符 Prisma Client 的程式；只關 UI 開關不足以避免 ORM 欄位缺失。
- `BEAUTY_MODULE_ENABLED`、收費規則／編輯開關及目標 Store allowlist 必須逐項核對；不得以測試店 ID 充當正式店。
- `BEAUTY_NOTIFICATIONS_ENABLED=0`；本輪不開 LINE、不設通知 worker、不更動正式店模組值。
- 不新增重複正式店；正式目標 Store、原 HQ 及角色綁定需先明確核對。

## 備份與回退

隔離庫 10/25 01:06:17 台灣時間的備份不是正式庫備份。正式執行前須核對正式 project 的成功備份時間、涵蓋範圍、還原權限與程序；Database backup 不涵蓋 Storage 物件本體。

優先停用新編輯／入口並保留新資料及帳本，不 DROP 六欄、不刪 Beauty 表、不恢復 SPA。已有收費快照後，不能回退到忽略技師限制的後端。整庫還原會影響其他模組在備份後的交易，不作為未審查的快捷回退。

## 剩餘實際驗收

1. 現金：隔離測試店 10/21 抽屜仍 OPEN；需確認補關金額及既有抽屜變更授權，才可開今日測試抽屜、測現金收退並留紀錄。不得猜測實際現金額，CARD 測試不能取代。
2. 正式包：先建立完整安裝／權限精確差異，在獨立可還原環境驗證，不拿正式庫試跑或重試。現有隔離庫已安裝，不能用它「重跑成功」冒充空庫首次安裝驗證。
3. 以上通過，且正式備份／回退／正式店接點確認後，才提出具體正式變更包與部署授權。19:00 交付期限不改變這些限制。

目前可交付的是完整 Preview 候選與測試證據；未宣告正式可上線。
