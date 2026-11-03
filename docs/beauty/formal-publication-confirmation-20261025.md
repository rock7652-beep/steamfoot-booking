# 美業正式發布確認單（已授權；執行受工具狀態阻擋）

核對日期：2026-10-25，台灣時間。使用者已確認本次是**先發布模組，暫不建立店家**。

後續使用者已明確「允許」本確認單的正式升級、連線與發布範圍。首次升級呼叫遇 `Invalid or expired requestState`，依約停止不重送；唯讀核對仍為 0 Beauty 表／無 BEAUTY enum／無新角色／無升級紀錄，正式站未變。[執行紀錄](formal-release-attempt-20261025.md) 為最新狀態，下方保留核准時的完整變更包。

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
| 正式備份 | 使用者提供的正式 steamfoot／main／PRODUCTION 截圖：最新列出 PHYSICAL 備份 2026-10-24 17:26:47 UTC，即台灣 2026-10-25 01:26:47；Restore 入口可見。未執行還原演練 |

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

## 正式備份與平台狀態

使用者提供的正式專案截圖已補齊核對資訊：steamfoot／main／PRODUCTION，最新列出的 PHYSICAL 備份為 **2026-10-24 17:26:47 (+0000)**，即 **台灣 2026-10-25 01:26:47**，旁有 Restore 入口。證據來源為使用者截圖，不冒稱由 API 獨立讀回，也沒有按下 Restore 或完成還原演練。

此時間與先前 Preview 的 01:06:17 不同，已分別記錄。備份頁上方有 Supabase 技術公告；唯讀查詢公開 status API 回覆 All Systems Operational、沒有列出非 operational 元件，同時仍有 Management API 多區域錯誤率事件處於 monitoring，最近更新為 10/23 10:54:49 UTC。這不代表事件已 resolved，也不能單憑狀態頁保證東京 API 完全無影響；實際執行前重查，如遇錯誤或結果不明則停止、唯讀核對，不重複提交變更。

備份不包含 Storage 物件本體；沒有做過正式還原演練。若需整庫還原，會影響其他模組備份後的交易，不能視為只回退美業。首選關閉美業入口／編輯並保留新表、快照與帳本；禁止 DROP、清資料或恢復 SPA。

## 可供使用者確認的正式變更包

使用者已在本確認單後明確同意對正式專案 `qijlnhtpbintanzpxkvf` 執行以下順序；授權來源是後續「允許」，不是備份截圖。本輪因工具請求狀態錯誤已停止，不能直接繼續提交。

1. 套用已驗證結構與受限角色候選：
   - `10-install.candidate.sql` SHA256 `930cec851bc799eda0105392c575c35bd6b1840b15843171e8e29fa4403bc233`。
   - `20-runtime-role.candidate.sql` SHA256 `3d175f4473bdbdac56eabc0f178f3fcf787db966db8e7f19c83122695eacf833`。
2. 安全設定新的美業 runtime 憑證及 Production 專用連線；不重設任何既有人員密碼、不覆蓋主 DATABASE_URL／DIRECT_URL，不將秘密寫入 Git 或交付文件。
3. 以新角色執行唯讀連線／postflight，確認結果與受限權限；這項必須在角色建立後實測，目前仍未完成。若連線、env 完整性或 migration target 無法確認就停止，不發布。
4. 依上述候選與正式 main 流程整合／完整建置；維持其他模組及 migration guards，確認不會自動套無關升級，然後才切換正式版本與開啟美業模組。
5. 正式 HQ 僅驗證美業建店選項可用，不提交建店；不搬資料、不啟用 LINE、不新增正式顧客／交易。

順序是：確認備份 → 取得精確正式變更授權 → 安裝 10 結構／20 角色與共享依賴 → 安全配置新連線並唯讀驗證 → 完整建置 → 經確認切換正式版本與開啟模組。任一步不符就停下，不重試覆蓋、不新增店家或清資料。

正式建置沿用既有 main 發布流程：`music-native-workflow-scope.mjs` 要求 Production 的 ref 為 main，不能直接把整合支線偽裝成正式。只有取得正式合併／發布授權後才將候選接入 main、固定新提交，並保留音樂 preflight。main 自動部署目前在 vercel.json 關閉，不把推送或合併當成已部署。

目前結論：**正式授權已取得，但首次升級工具請求失效，唯讀確認升級未套用；沒有重送，也沒有發布。新的 runtime 連線仍未建立或實測，不預先宣稱完成。**

證據：[本輪唯讀摘要](evidence/20261025-production-package/publication-preflight.json)、[執行包](../qa/beauty-production-review-20261025/RUNBOOK.md)、[63 項結果](evidence/20261025-production-package/postgres-results.json)。
