# 美業正式發布確認單（待備份確認，尚非執行授權）

核對日期：2026-10-25，台灣時間。使用者已確認本次是**先發布模組，暫不建立店家**。

## 本次精確範圍

- 正式 HQ 可使用美業建店入口；不新增正式店、不把音樂／運動／蒸足既有店改成美業、不搬入任何 Preview 店或測試顧客／交易。
- 現有 9 間正式店（6 COURSE、3 STEAMFOOT）與 HQ／人員綁定保留。正式 BEAUTY 店目前為 0。
- 安裝已驗證的 14 表與受限角色，部署包含美業功能的整合候選。LINE、美業外部通知維持關閉；其他模組的既有 LINE 設定不得為此修改。
- 來源候選為 `408da9d52e947e658d62fb867a85ca70dfa52f15`；業務程式沿用已部署 Preview 的 `e0b4e731`，其後新增 SQL 審查包、驗證腳本與報告，沒有另改業務 UI。
- 本輪未推送、合併正式 main、部署或執行任何正式寫入。

## 已核實事實

| 核對 | 結果 |
| --- | --- |
| 正式 Supabase | `steamfoot`／`qijlnhtpbintanzpxkvf`；ap-northeast-1，ACTIVE_HEALTHY，Postgres 17.6.1.104 |
| 正式資料庫 | Beauty 表 0、專用 Beauty runtime role 0；需安裝，不能直接發布新版 Prisma Client |
| 正式網域 | steamfoot.com／www.steamfoot.com 均仍指向 `dpl_3hvffPdypf9z2wT4YjFAwXzbzjPe`；前者 308 導向後者 |
| 正式版本 | READY、main `62480ec422d7952f7b1dc9310350b38d2a258fca`；GitHub remote main 仍為同一提交 |
| 升級包 | 本機 Postgres 17.6、63 項驗證通過；64 個明列共享欄位在正式庫全部存在；正式 metadata SELECT 未變更資料 |
| 現金與帳本 | 隔離店現金收退各 900、抽屜關帳差額零；前輪儲存重開、多人預約、扣次／恢復與權限結果保留 |

## 連線與設定核對

目前只讀 Vercel 設定 metadata，沒有解密 DATABASE_URL、DIRECT_URL、AUTH_SECRET 或任何既有秘密。可見正式設定有主 DATABASE_URL／DIRECT_URL；其內容及即時連線**沒有重新解密或測試**。Vercel 清單回應截斷為 100 筆，另有 82 筆省略，因此不能據此宣稱已完整列出所有正式設定或 Beauty key 全不存在。

正式 Beauty runtime role 尚不存在，新的專用連線仍不可視為已可用。這項將列入正式升級核准範圍，不能在唯讀核對階段偷偷建立或改密碼。

| 設定 | 擬定值／核對方式 |
| --- | --- |
| 主 DATABASE_URL／DIRECT_URL | 原值保留；不得換成 Beauty 專用角色，否則音樂／運動等共用功能會失去原權限 |
| 新 runtime role | 擬名 `steamfoot_beauty_prod_20261025`，套用前再查無重名；不沿用本機 QA 角色或 postgres |
| BEAUTY_DATABASE_MODE | `dedicated`，僅 Production scope |
| BEAUTY_DATABASE_URL | 新的 server-only Secret；指向正式專案、database postgres、public schema、上述受限角色與 TLS。實際 pooler host／埠由正式 Supabase Connect 畫面確認，不推測 hostname、不公開憑證 |
| BEAUTY_MODULE_ENABLED | 結構與連線驗證前 `0`，核准發布時才 `1`，讓 HQ 建店 action 可用 |
| BEAUTY_NOTIFICATIONS_ENABLED | `0` |
| BEAUTY_CHARGE_RULES_ENABLED／EDITING_ENABLED | 擬定 `1`；allowlist 留空，所以這次沒有任何店家啟用新收費規則；不設定 Preview 或既有店 ID，日後實際建店再核對加入 |
| BEAUTY_CHARGE_RULES_STORE_IDS | 空值；不代表已對所有未來店家開放收費規則 |
| BEAUTY_HOSTED_PREVIEW 與 QA flags | 不帶入 Production |
| MUSIC_NATIVE_WORKFLOW_STORE_IDS 等既有開關 | 保留，不能為美業覆蓋 |
| PRODUCTION_MIGRATION_TARGET | 此次建置需確認未指定其他 migration 目標；`ci-migrate.mjs` 沒有 target 才會 `migration_skipped_no_target`。本輪 metadata 清單不完整，執行前需明確核對；若已設值就停止另行審查，不自行移除或覆寫 |

部署前以新 runtime 連線執行 metadata 與零寫入查詢，核對 current_user、TLS／pooler、14 表 RLS、敏感欄位拒絕與原共享讀取；**不能用管理員的 MCP SELECT 成功替代 runtime 連線成功**。目前該項尚未執行，亦沒有建立秘密。

## 備份：唯一待使用者補充的前置資訊

尚未取得**正式專案 steamfoot**最新成功備份的日期／時間及時區。現有 Supabase 連接器沒有備份清單操作，Browser extension 控制工具未連入本輪；TinyFish 餘額不足，未啟動瀏覽器、未要求儲值。不能以專案 ACTIVE_HEALTHY 推論備份成功。

請核對 [正式庫 Backups](https://supabase.com/dashboard/project/qijlnhtpbintanzpxkvf/database/backups)，回覆最新成功項目的完整時間與時區／可 Restore 狀態。先前提供的 10/25 01:06:17 台灣時間是 `steamfoot-preview` 備份，**不適用正式庫**。

備份不包含 Storage 物件本體；沒有做過正式還原演練。若需整庫還原，會影響其他模組備份後的交易，不能視為只回退美業。首選關閉美業入口／編輯並保留新表、快照與帳本；禁止 DROP、清資料或恢復 SPA。

## 待備份核實後的正式確認內容

屆時交付確認應明列：正式專案與成功備份時間、上述不建店範圍、兩份 SQL 的 `release-manifest.json` SHA256、runtime 角色與 Secret 配置、只讀 postflight、候選提交、建置不自動 migration、原部署回退點及分階段停止條件。

順序是：確認備份 → 取得精確正式變更授權 → 安裝 10 結構／20 角色與共享依賴 → 安全配置新連線並唯讀驗證 → 完整建置 → 經確認切換正式版本與開啟模組。任一步不符就停下，不重試覆蓋、不新增店家或清資料。

正式建置沿用既有 main 發布流程：`music-native-workflow-scope.mjs` 要求 Production 的 ref 為 main，不能直接把整合支線偽裝成正式。只有取得正式合併／發布授權後才將候選接入 main、固定新提交，並保留音樂 preflight。main 自動部署目前在 vercel.json 關閉，不把推送或合併當成已部署。

目前結論：**發布範圍與變更包已具體化，但備份時間與尚待配置的新連線不可標記已驗證，因此尚不可直接正式發布。**

證據：[本輪唯讀摘要](evidence/20261025-production-package/publication-preflight.json)、[執行包](../qa/beauty-production-review-20261025/RUNBOOK.md)、[63 項結果](evidence/20261025-production-package/postgres-results.json)。
