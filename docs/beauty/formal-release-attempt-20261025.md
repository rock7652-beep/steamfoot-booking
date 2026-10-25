# 美業正式發布執行紀錄（2026-10-25）

使用者已明確允許正式結構／角色升級、專用連線與通過驗證後發布。範圍仍是 HQ 可建立美業店；這次不建店、不搬測試資料、LINE 關閉。授權已保留，並非仍在等待相同的發布授權。

## 已停止的正式升級呼叫

正式 project `qijlnhtpbintanzpxkvf`，工具 `supabase_apply_migration`，migration 名 `beauty_production_base_20261025`。送出的候選檔 SHA256 為 `930cec851bc799eda0105392c575c35bd6b1840b15843171e8e29fa4403bc233`，另加已核對的三個 session review settings。

工具回報 **`McpServerError: Invalid or expired requestState`**，reason `invalid_request_state`。這是工具請求狀態錯誤，不是已知 PostgreSQL 語法錯誤、不是資料庫成功套用，也沒有證據可以稱為使用者拒絕或自動審查拒絕。

依已確認「異常／結果不明就停止，不重複提交」要求，沒有重送、換 migration 名稱、改走 execute_sql 或其他接點套用相同 DDL。

## 隨後唯讀核對

| 項目 | 前後結果 |
| --- | --- |
| Beauty 表 | 0 → 0 |
| BEAUTY enum value | 仍不存在 |
| 專用 runtime role | 仍不存在 |
| 該 migration history | 0 筆 |
| Store | 9 間，完整列內容摘要仍 `dd65d72d935a0e6ff4330ef243c3a5f6` |
| Customer／Staff／CashbookEntry | 618／17／110，筆數與前置查核一致；沒有宣稱對所有列做內容雜湊 |

因此本輪確認**正式升級尚未套用**。角色階段、密碼設定與連線寫入均未開始；未推送 main、未建立部署、未切換網域、未啟用 LINE。

## 可獨立完成的本機準備

Vercel 的既有敏感 DATABASE_URL API 只回 metadata 與 decrypted=false，沒有讀到既有密碼。為避免索取或猜測正式 pooler endpoint，本機新增 production-only adapter：沿用現有主連線已配置的 host／port／database，只替換成核准的新美業角色與新 server-only 密碼。主 DATABASE_URL 原字串不變；新連線固定驗證正式 project、角色、Production/main、TLS、無 QA scope。舊的專用 URL 模式仍保留。

- 新設定方案：`BEAUTY_DATABASE_ROLE=steamfoot_beauty_prod_20261025`、新的 Secret `BEAUTY_DATABASE_PASSWORD`，配合 `BEAUTY_DATABASE_MODE=dedicated`；不用讀回既有 Secret，也不在建置產物寫入新 URL／密碼。不得同時配置 URL 與 password 兩套來源。
- `scripts/beauty-production-release-preflight.mjs`：在正式建置前，以新角色實際連線、確認經 CA 驗證的 TLS socket、BEGIN READ ONLY、14 表／RLS／必要欄位與敏感權限；有 PRODUCTION_MIGRATION_TARGET、Preview／QA flags 或非空店家 allowlist 就拒絕。錯誤只輸出固定摘要，不帶秘密。
- 連線、既有 URL 相容及 client 選用等三檔 53 項**離線／mock 測試**通過。不是正式 runtime 連線驗收；本輪因正式角色尚未建立，未執行新預檢的遠端連線。
- TypeScript noEmit、三個異動程式檔 ESLint 與差異檢查通過。初次測試 fixture 缺 NODE_ENV 的型別錯誤已在本機修正，未部署過錯誤版本。
- 這些程式仍只在本機，未推送或部署，也尚未接進實際正式 build。後續發布必須把此唯讀預檢放在任何 ci-migrate／build 步驟之前，不能用它代替既有音樂 preflight。

## 續接點

目前阻擋是升級工具的 requestState 失效，不是缺少使用者的正式發布授權。保留錯誤與唯讀證據，停止本輪正式寫入；工具的有效請求狀態恢復、並再次唯讀確認仍未安裝後，才可依使用者指示續接。不要自行反覆重試、改走其他寫入通道或把本輪記成部署成功。

證據：[呼叫與前後狀態](evidence/20261025-production-package/formal-execution-attempt.json)、[發布範圍](formal-publication-confirmation-20261025.md)。

## 使用者要求恢復工具後的續行結果

使用者明確要求恢復有效請求狀態、核對現況續行。先重新唯讀確認零 Beauty 表、無角色、無升級紀錄及既有筆數一致，再送出新請求，成功套用核准的 base 與 runtime SQL，並為新角色配置獨立 SCRAM 憑證。沒有重設既有角色密碼。

- 正式 14 張 Beauty 表及 RLS 已建立；六個 nullable/no-default 收費欄位逐項符合。
- 新角色可登入、無管理權限、無 membership、無 passwordHash 讀取及 BeautyPayment 修改／刪除／截斷權限。
- 升級後 Store 9、Customer 618、Staff 17、CashbookEntry 110；Beauty 店仍為 0。這是筆數核對，不宣稱所有內容均做相同基準雜湊。
- Vercel Production 新增專用密碼及功能旗標被自動審核拒絕：可信使用者內容未明確授權將敏感憑證交給此特定目的地。該寫入未執行；未換其他通道繞過。
- 阻擋目的地：Vercel team `team_IAPnhzLHM4x540wiXg3lTyS9`、project `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`（steamfoot-booking）、Production，server-only Sensitive `BEAUTY_DATABASE_PASSWORD`，以及非敏感 Beauty 專用連線／功能旗標。主 DATABASE_URL／DIRECT_URL 保留，LINE flag 為 0。
- 已在本機 build 最前方接入唯讀 Beauty runtime preflight，保留原音樂及其他 guards，避免連線未驗證即進入 ci-migrate。新增 gate ESLint 與差異檢查通過，連線相關 53 項測試通過。
- 尚未實測正式 runtime 密碼登入；尚未推送 main、部署、切網域或建店。正式資料庫已升級，正式網站程式仍是原版，不能再描述為正式庫未動。

後續需要明確目的地授權，再配置上述 Vercel 正式環境，實際通過 readonly runtime preflight 後才發布。憑證不納入 Git、報告或工具輸出。
