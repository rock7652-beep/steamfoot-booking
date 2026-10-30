# 數位店長資料庫變更：待審查清單

此文件與 SQL 為正式 migration 的審查材料，並未授權或執行正式資料庫變更。功能分支目前只允許指向指定隔離 Preview 資料庫，建置不執行 migration，且外部通知維持封鎖。

## 最後發布審查：未驗事項與停止條件

目前結論：主要隔離業務流程及必要的正式唯讀前置條件已有證據，但不能將整案標為正式驗收完成。以下各項由本任務助理承接技術核對，不要求使用者另找技術人員。正式 migration、合併與部署仍須使用者明確確認其範圍；本表本身不執行任何操作。

| 階段 | 通過標準與處理方式 | 失敗時停止條件 |
| --- | --- | --- |
| 正式更新前 | 核對最終程式版本、SQL checksum、當前正式 fingerprint、migration 帳本、備份可用時間與資料保全；固定可回退的舊版部署並取得舊版／新增結構相容性證據。現有備份截圖與本機合成資料演練不能當成正式復原成功證據。 | 任一版本、校驗、資料庫目標或指紋不符即停止；不可更新基準來直接放行。備份／舊版回退方法未確認前不安排正式寫入。 |
| 正式資料庫單項更新 | 取得授權後只執行 `20261030150000_digital_manager_notice`，核對新表、RLS、欄位授權、六個 trigger、函式及帳本；確認其他歷史 migration 未被執行。 | 發布器、帳本或授權檢查任一失敗即停止應用部署。Prisma 已提交的資料庫變更不會因後續檢查失敗自動撤銷，須保全資料並依回退審查稿處置。 |
| 新表與應用驗證 | 既有美業帳號登入／TLS 檢查已通過；新表須待安裝後，用實際受限連線驗證可讀及必要操作。若要在正式門市寫入測試，需先限定測試門市、合成資料與授權，禁止拿真實顧客資料冒充測試。正式建置 readiness 必須回 ready。 | 出現權限不足、跨店可讀寫、找不到新表、業務預約／核帳失敗或 readiness 拒絕，均不得切換新版本流量。不得改用高權限帳號讓測試通過。 |
| 遠端排程 | 隔離 Preview `8b6757b9` 已完成三個入口的真正 bearer 授權、手動觸發、failed=0、19 筆同店新通知、四次授權呼叫後去重，以及 LINE 發送結果為 0。晨間 09:05 使用嚴格限制於隔離分支的驗收營業時間；未驗正式／自動排程。詳見[工作紀錄](store-manager-bell-work-in-progress-20261030.md#隔離-preview-授權排程補驗)。 | 未授權請求應 401；已授權工作若 401／500、failed 非 0、跨店、重複或業務資料不一致，均停止後續推廣。不得取消排程驗證、擴大權限或用一般登入取代 CRON_SECRET。 |
| 回退 | 先停止新版本推廣並保全新增資料；核對舊版相容性、實際流量切換方式及資料庫回退的前置條件。既有 SQL 要求相容舊版、停止寫入者、備份及另行授權，不可當成一鍵自動回退。保留業務資料、通知及帳本。 | 舊版相容性、停止寫入者或 SQL 前置條件不明時不執行資料庫回退；不得用舊快照覆蓋更新後的新付款、預約或消費資料。回退後新版本 readiness 會失敗，不能直接重跑發布器或改帳本。 |

真實 LINE 流程、實體 Safari／LINE 內建瀏覽器、遠端專用美業角色的新通知表操作及所有營運事件組合，仍依各自證據保持未驗；不能用本次通用方案預約通過來代替。現有 LINE 發送設定本次不變更。

## 順序與校驗

| 順序 | 候選 SQL | SHA-256 |
| --- | --- | --- |
| 1 | `scripts/sql/digital-manager-notice-candidate.sql` | `b4c6c7103a121d75d2b90da813b7b2a00073d6c885f44a1a3fe7e37f0ff7af39` |
| 2 | `scripts/sql/steamfoot-digital-manager-booking-candidate.sql` | `adf0b38d3f298b92b3462c0d781c36aad7d9fb3e3f8415ce0500d9e481893850` |
| 3 | `scripts/sql/steamfoot-digital-manager-payment-candidate.sql` | `bc8aaacdfbe33853e456bb04dab0c51f419df7cc7ab3f4555238df4c819f5796` |
| 4 | `scripts/sql/digital-manager-lead-candidate.sql` | `cf732d131b1f41cbc39933852530c326978ea1bf8283d0fbe50faed4cd762317` |
| 5 | `scripts/sql/digital-manager-vip-candidate.sql` | `85511aca1b164611970d12da72b58005c588dc2a8f56282a9d15dfe6caf324d3` |
| 6 | `scripts/sql/digital-manager-incomplete-resolution-candidate.sql` | `5b5a84e5c4d6ae1578c256f0c305d891ce7191cd505a66aa6226780c1598ed01` |
| 7 | `scripts/sql/digital-manager-beauty-access-candidate.sql` | `a4044529b0d4f48f268ca777a395471d5bc07e60eb3255f414c2c237eb2edf4f` |

1 必須先於 2–7；7 另需確認正式美業實際採用的受限 runtime role，不可猜測或以 postgres／anon／authenticated 取代。候選 SQL 須轉成符合現行 migration 流程的正式版本，並與實際部署 commit 一起審查。不得直接把本清單當成可執行正式發布腳本。

已產生 `prisma/reconciliation/20261030_digital_manager_migration_review.sql`，依序合併 1–6 並包在同一交易內，SHA-256 為 `4d6f2db1fff1feabbc42f39c2b5060df8d02a4e4f658345d6f5f810aed74d129`。它是審查稿，刻意不放入自動 migration 目錄，也不包含需指定受限角色的 7。現有正式發布流程有 migration 目標白名單與安全檢查；尚未將此稿註冊為正式 migration 或加入可執行的發布目標，不可跳過這些檢查。上線前仍須確定實際 migration 帳本、相依項、角色與備份，建立並驗證符合現行流程的版本。

另準備包含 1–7 的單交易審查稿 `prisma/reconciliation/20261030_digital_manager_scoped_with_beauty_review.sql`，SHA-256 為 `7effc6fba18452850c179b6cca993e84405bf9e76729dc19ef9a088f7a57246d`。其中明確指定目前唯讀核對到的正式美業角色；角色不存在、權限不足或角色不安全時整批失敗。此稿已接入本功能分支中指定目標的受控發布流程；尚未合併，正式資料庫仍未執行。禁止直接用一般全量 migration 流程執行。

## 已驗與未驗

隔離資料庫已安裝 1–6 的候選結構；2 的更新已在隔離資料庫驗證，即使舊通知開關關閉也會產生當日預約提示，店員代建的當日預約已依新決策調整為不建立預約通知；隔離資料庫以交易確認顧客當日預約仍列待處理、店員代建沒有通知，交易已回滾；測試交易已回滾。7 已在本機隔離資料庫使用受限角色測試，並在 Preview 資料庫安裝至專用 NOLOGIN 測試角色；Preview 平台拒絕 `SET ROLE`，因此該角色的實際查寫仍未驗證，不能以本機結果替代。正式資料庫尚未套用 7。正式 schema、實際連線角色與授權、完整 migration／回滾演練仍待核對。

審查稿已在本機 PGlite 合成 schema 上完整安裝兩次，確認新 trigger 數量、檔案內容與六份候選一致；移除必要資料表時，確認整批交易回滾。這不是正式資料庫副本或正式 Prisma migration 的完整部署／回滾演練。受限角色本機測試另確認可處理美業通知及啟用紀錄，禁止修改 targetId、寫入不相符事件類型、刪除通知及跨模組寫入。

補充真實 PostgreSQL 16 本機演練：在全新專用隔離資料庫建立獨立 LOGIN、非 superuser、非 BYPASSRLS 角色，安裝候選 1、7 並重新執行確認可重複。以該角色真實登入，確認三種美業事件的新增、去重、處理、啟用紀錄與限定門市查詢；跨業態寫入、事件類型不符、刪除和修改受限欄位均遭拒絕。另透過該角色的 Beauty Prisma 連線實際執行 `recordDigitalManagerNotice`／`resolveDigitalManagerNotice` 成功。腳本為 `scripts/qa/beauty-digital-manager-role-postgres.mjs` 及 `scripts/qa/beauty-digital-manager-role-service.ts`；前者只接受指定本機空資料庫及未使用角色。這仍不是正式角色的登入驗證或完整正式環境演練。

此共用角色的 RLS 限制美業範圍，但不單獨區分不同美業門市；必須由每個伺服器操作核實使用者及目前門市並限定查詢。`beauty-combined-notices.test.ts` 有本店資料與跨店拒絕的應用層測試；上線前仍須以正式設定驗證實際連線角色與端到端跨店隔離。

單項 Prisma 安裝演練使用 PostgreSQL 16 全新本機測試資料庫、合成基礎 schema 及本次審查稿，執行 `scripts/qa/digital-manager-scoped-prisma-rehearsal.mjs`：僅把單一目標放入暫存 migration 目錄，執行真正的 `prisma migrate deploy`；24 個其他 migration 以同名、帶有可偵測寫入的合成 SQL 表示，結果維持待處理且未執行，既有帳本及測試顧客資料保持不變。另確認美業受限角色、顧客當日預約提示與店員代建不提示；缺少美業角色時整批回滾以 PGlite 測試確認。演練不是正式資料庫副本，也不是已完成正式發布器、正式角色登入或正式回退演練。

2026-10-30 備份及回退隔離演練：`scripts/qa/digital-manager-backup-rehearsal.mjs` 在 PostgreSQL 17 合成資料庫使用 `pg_dump -Fc` 備份，還原到同一測試叢集的新空資料庫。逐表核對合成顧客、方案、預約、付款、消費、通知與 migration 紀錄的筆數和內容摘要，並在還原庫通過通知結構／RLS／授權／trigger／帳本 readiness 檢查。備份後新增的測試付款與通知留在來源庫，沒有出現在較早備份中，故不可直接將舊備份覆蓋有新資料的正式庫。

僅供審查的 `prisma/reconciliation/20261030_digital_manager_rollback_review.sql` 在單一交易中驗證目前預約函式和六個 trigger 的預期狀態，移除這六個新 trigger 並恢復既有預約函式；保留通知表、資料、政策、授權與 migration 帳本。隔離測試確認 trigger 狀態不符時整批拒絕，成功回退前後採樣的業務資料、通知與帳本逐表一致；回退後的新應用 readiness 檢查拒絕通過。此審查稿的 SHA-256 為 `fe34ac96cb10f125e06bd386a2e793ba83650b2fde8622fe1564dcbe4cb4184b`，不代表可直接在正式站執行。

演練限制：使用合成的部分 schema、沒有正式顧客資料；還原庫與來源庫共用同一測試叢集角色，未演練獨立叢集重建角色；未驗證舊版應用的實際部署／流量切換，也未確認正式備份及復原能力。正式事件應優先保全備份後的新資料並依核准流程進行應用回退，不可逕以快照覆蓋正式資料；此回退會保留已套用 migration 紀錄並使新應用 readiness 失敗，重發布前必須另行審查對帳，不得直接改帳本或重跑。

Preview 中的 `steamfoot_beauty_data_dmqa` 僅是無登入能力的測試角色；清理其政策與角色的工具要求返回 `Invalid or expired requestState`，目前仍保留，並未修改正式環境。重新清理前應核對角色仍無登入能力且政策僅屬於該角色。

2026-10-30 唯讀核對：正式資料庫已有 `steamfoot_beauty_prod_20261025` 受限登入角色，非 superuser、非 BYPASSRLS，具備 `Store.id` 與 `Store.industryModule` 欄位的 SELECT 權限；`Store` 啟用 RLS 且已有該角色的 SELECT policy。正式環境設定列出美業資料庫模式為 `dedicated`；尚須在發布前重新確認實際連線角色與政策及正式 schema 相符。正式資料庫尚無 `DigitalManagerNotice` 與 `DigitalManagerActivation` 表，故不得先部署本分支程式。

同日重新唯讀核對：該角色沒有整張 `Store` 表的 SELECT，兩個必要欄位均有 SELECT；既有 `Store` 對該角色有多項 SELECT／ALL 政策，包含 `true` 條件，不能假定 `Store` 的 RLS 本身只回傳美業門市。候選通知政策另外明確限制 `industryModule = 'BEAUTY'`；實際應用操作仍須驗證登入角色與門市邊界。

2026-10-30 正式資料庫額外唯讀確認：`record_steamfoot_store_notice()` 存在且有啟用中的 Booking trigger；兩張新通知表仍不存在。這只是部分前置條件，不能取代完整 schema／授權 fingerprint。

同日再次透過 Supabase 唯讀查詢確認：`steamfoot_beauty_prod_20261025` 可登入，`rolsuper`、`rolbypassrls` 與 `rolinherit` 均為 false，對 `Store.id` 與 `Store.industryModule` 有欄位讀取權限；兩張數位店長表仍不存在。這項查詢使用管理連線觀察角色屬性，並非以該角色登入，不能證明應用使用的連線或新表讀寫成功。Preview 的 `SET ROLE` 已遭平台拒絕，不得使用其他憑證繞過；應透過獲正式授權的受限角色連線，在隔離環境確認 `current_user`、RLS 與正反向操作，待正式 migration 經授權套用後再於正式環境進行限定範圍的上線檢查。

2026-10-30 另以管理連線唯讀查詢 `pg_stat_activity`，當時可見一個以 `steamfoot_beauty_prod_20261025` 登入正式 `postgres` 資料庫的 idle client backend；Supavisor 最近 24 小時日誌也列出該角色的 `handle_auth_success/2` 認證成功事件，最近一筆為 10:00:09 UTC（台灣時間 18:00:09）。這證明該角色在正式資料庫有實際連線活動，但無法單憑這些統計確定連線來自哪個應用部署、TLS 驗證、執行查詢內容或新通知表的讀寫與門市隔離；本工作環境亦未取得該角色的受控連線，完整 preflight 仍未完成。查詢未讀取顧客資料，也未輸出憑證。

再次唯讀查詢當時的資料庫連線顯示 application_name 為 `Supavisor`，`pg_stat_ssl.ssl` 為 false；此欄位僅描述連線池到資料庫這一段，不代表應用到連線池的 TLS 狀態，也不能據此宣稱 TLS 已驗證。正式版本的建置程式在符合 production 且美業啟用時包含 Beauty 唯讀 preflight，但可取得的建置紀錄缺少成功標記，不能推定該次確實執行或成功；應用端 TLS／實際登入檢查仍待取得可核實結果。

補充：先前檢索因 Vercel 回傳的 100 筆事件省略中間紀錄，未找到成功標記；分時段查詢後已找到。正式部署 `dpl_8urBcNnQLyf1w9EfQYwWbj6vLVNy`（來源 `eb73ebcf4089b795841597b1ff8c088e5382cf17`）於 2026-10-30 14:53:46 台灣時間輸出 `[beauty-production-preflight] runtime_login=true tls=true prisma=true shared_todos=true schema_tables=19 readonly=true migration_target_absent=true`。已核對同一 commit 的實際程式：在正式環境下使用 dedicated 美業連線，驗證 TLS socket、`current_user`、資料庫、受限角色屬性、既有 schema／欄位與 Prisma 連線，查詢採唯讀交易。故已有該次正式建置的真實受限角色登入與唯讀檢查成功證據；不是本次重新登入，也不驗證當時尚未建立的小鈴鐺新表。應在上線時再確認最新環境及新表授權。不得為取得結果而新建正式診斷入口、觸發正式部署、擴權、重設密碼或繞過既有環境限制。

正式備份畫面證據：使用者於 2026-10-30 提供正式 `steamfoot` 專案 `main / PRODUCTION` 的 Scheduled backups 截圖，畫面列出 7 個每日 PHYSICAL 備份，最新為 2026-10-29 17:23:32 UTC（台灣時間 2026-10-30 01:23:32），最舊為 2026-10-23 17:24:32 UTC。畫面為各筆顯示 Restore 操作，但未實際執行還原，不能據此證明還原成功；PITR 是否啟用及可用範圍也未由此畫面確認。上線當日應重新核對最新備份，另確認還原演練及應用流量回退的負責人與證據。Supabase 文件指出每日備份不保存自訂角色密碼、Storage 物件不包含於資料庫備份，還原期間專案無法使用；具體適用情況與憑證復原程序仍須依正式專案核實。不得以較早備份直接覆蓋其後新增的業務資料。

## 受限連線與上線／回退順序（審查用，尚未執行正式發布）

最近 UI／通用方案實測程式版本為 `98c0049a4a68277ca4f146ac6f8061dcbc71c0de`（新增限定合成運動店的隔離驗收入口，SQL 審查稿未變更）；本次發布器修正及舊版演練另見文末。正式發布前須重新確認最終 commit、相依部署及下列各項結果；任何一項不符即停止，保留既有安全檢查及 LINE 停發設定。

2026-10-30 再核對 Vercel：當時最新列出的正式部署為 `dpl_8urBcNnQLyf1w9EfQYwWbj6vLVNy`，來源 `main` 的 `eb73ebcf4089b795841597b1ff8c088e5382cf17`，狀態 READY。GitHub commit 比對顯示該正式版是候選 `b48047d` 的祖先，候選版領先 19 commits；這只證明版本包含關係，不代表與當時及後續正式資料庫相容，上線前仍需重新比對。上述正式建置的美業 preflight 成功證據已於分段檢索後找到。本機重新執行四個相關測試檔，共 43 項通過，範圍為發布防護、migration 審查、美業資料庫 URL 與通知 SQL；不代表正式資料庫或 Vercel 已執行這些測試。

1. **資料庫及發布負責人**：確認專案與目標、更新最新備份時間、可用還原點、備份後資料保全及 Storage／角色密碼復原方式；指定資料庫與應用回退負責人。還原演練應在隔離目標進行，不能覆寫正式庫。
2. **美業連線負責人**：既有正式建置已通過 dedicated 連線的唯讀 preflight；上線時重新確認當前部署及結果，使用既有正式環境憑證，勿將連線字串或密碼寫進紀錄。新通知表尚未安裝，這項既有檢查無法驗證新表讀寫。
3. **資料庫及應用負責人**：正式寫入獲明確授權後，先審查最終 checksum、正式前置 fingerprint、migration 帳本與指定目標 `20261030150000_digital_manager_notice`；只走既有受控單項發布入口。不得執行一般全量 `prisma migrate deploy`，不得自行補登其他項目。執行後檢查帳本、新表、RLS、授權、trigger 及 fingerprint；若 Prisma 已提交後檢查失敗，停止應用部署並啟動事件處置，不能宣稱已自動回滾。
4. **應用負責人**：完成資料庫檢查後，以實際受限角色確認新表的必要授權；針對通知服務的寫入及跨店拒絕優先在隔離環境以合成資料驗證。正式環境若需寫入測試，另界定測試門市、資料、清理與授權；不可使用真實顧客資料冒充測試。再依核准版本部署，確認部署來源、readiness、門市通知與權限，維持 LINE 原設定。
5. **異常處理**：先停止新應用發布或流量切換並保全事件後資料；由應用負責人依可用舊版及相容性證據決定回退流量。資料庫負責人審查 `prisma/reconciliation/20261030_digital_manager_rollback_review.sql` 的前置條件後，才決定是否另行執行資料庫回退；該審查稿不刪除通知或業務資料，但會使新版本 readiness 失敗且保留 migration 帳本，重新發布前需對帳。不得自動以舊快照覆蓋正式資料。正式流量切換及獨立叢集復原尚未實際演練；既有正式建置的受限角色登入已通過唯讀 preflight。

2026-10-30 正式 Prisma 帳本唯讀比對功能分支 `1ebfcd6a`：分支有 154 個 migration，正式帳本已完成 130 個、沒有未完成紀錄；已登記者的名稱與 checksum 均與分支一致。分支另有 24 個沒有完成紀錄，包含既有歷史對帳的 23 個及 `20261025160000_course_personnel_label`。沒有帳本紀錄不等於資料庫中相應結構不存在，不能因此自行補登、執行或重建。**不可直接執行一般 `prisma migrate deploy`**：它可能連同這些其他變更一起套用；須先依各項結構與歷史證據完成對帳，另設計受審查、精確限定的通知 migration 和帳本處理，再核對備份與回退流程。既有歷史證據見 `docs/verification/sports-production-migration/history-reconciliation-plan.md`。

已在本功能分支將 `scripts/digital-manager-migration-review.mjs` 單項發布程式接入 `ci-migrate.mjs`；只有明確指定 `20261030150000_digital_manager_notice` 才會執行該項 migration，沒有目標時維持不執行 migration。候選程式固定 SQL checksum、指定專案／正式主分支／連線、驗證新表不存在與既有 schema 指紋、檢查失敗紀錄與並行鎖，並在單項 Prisma 執行後核對通知結構、政策、授權、觸發器、函式與未涉及的 migration 帳本。正式環境的唯讀前置指紋於 2026-10-30 兩次核對一致；正式環境若變動必須重新審查，不能單純更新指紋放行。

候選程式已以 PostgreSQL 16 與 17、真正 Prisma CLI 及合成資料演練成功；驗證其他 24 個同名測試項目不執行、範圍／鎖／失敗帳本遭拒，已完整套用的目標重跑時先驗證並安全跳過，且移除 RLS、修改 policy 或多授更新權限會被發布後檢查擋下。**Prisma 是獨立程序：若 SQL 已提交後才發現發布後檢查失敗，資料庫變更不會自動回滾**，必須停止應用部署並依已審查的資料保全與回退程序處理。本功能分支已將唯讀 readiness 檢查接入正式應用建置；以 PostgreSQL 17 及嚴格本機 QA 範圍實際執行 ci-migrate 和 readiness 入口，驗證安裝前會擋下、安裝後通過、重跑可驗證跳過；這表示分支合併後的正式建置將需讀取資料庫，且在 schema 未就緒時失敗。正式發布仍須確認上線時角色狀態及新通知表授權／查寫，並處理前述備份、回退演練限制；正式指令、上線與任何正式寫入均另需使用者授權。

上線前須確認資料庫識別與備份、所有相依 migration、隔離演練與權限測試；先安裝並驗證資料庫，再部署相容的應用版本。候選 trigger 同交易寫入通知，缺少表或執行權限可能使預約、付款等業務操作失敗，禁止先上應用再補資料庫。回退時需保留既有預約、付款及通知紀錄，不以刪除業務資料作回滾。

## 新版通用方案補驗後的正式唯讀核對

2026-10-30 再次執行既有 preflight snapshot，正式 fingerprint 仍為 `787252b4c60e4819ffa2f79f9969fa3d`，12 個必要關聯及 1 個既有函式，與發布器固定基準一致。另確認兩張新通知表仍不存在、未完成 migration 為 0、本次目標帳本紀錄為 0；正式 Vercel 最新列出的 READY 版本仍為 `eb73ebcf4089b795841597b1ff8c088e5382cf17`。這只證明上述安裝前條件未漂移，不代表遠端排程授權執行、正式新表讀寫、正式還原／流量回退或真實 LINE 已驗證，也不授權合併、正式 migration 或部署。

## 完整合成結構、舊版相容性與獨立還原補驗

2026-10-30 本次補驗使用獨立 PostgreSQL 17 叢集，從既有本機合成資料備份還原。來源庫保留且停止使用；不是正式庫的匯出或複本。163 張 public 資料表的筆數與逐列內容摘要比對一致，角色定義另外還原且刻意不包含角色密碼；本機以 loopback trust 驗證合成角色，不能替代正式密碼或 TLS 驗證。後續補齊本機運動測試結構，回退比較範圍為 164 張表。

補驗發現並修正發布器的政策檢查錯誤：原預期政策摘要來自 `Store.industryModule` 為 text 的簡化 schema；正式唯讀查詢證實實際為 `public.IndustryModule` enum，正確政策的反解析文字會保留型別轉換，造成原安裝後檢查錯誤拒絕。現在明確檢查業態欄位必須為該 enum，使用 enum 結構推導的精確政策摘要，不同型別及過度開放的政策仍被拒絕。正式前置 fingerprint 與 SQL 審查稿、SQL checksum 均未放寬或變更。

- PGlite 的政策型別／過度開放拒絕與既有審查、防護測試共 11 項通過；相關測試 ESLint、完整 TypeScript 檢查通過。
- 真正 PostgreSQL 17 及 Prisma 單項發布器改用 enum 合成 schema 重跑通過，涵蓋實際 ci-migrate／readiness 入口、安裝、重跑、鎖、失敗帳本、RLS／政策／多授權拒絕；24 個其他歷史 migration 保持未執行。先前 text schema 演練不再作為政策檢查正確的證據。
- 以 `eb73ebcf4089b795841597b1ff8c088e5382cf17` 的原始碼啟動本機舊版網站；三套 Prisma schema 與目前分支相同，使用同版本依賴及產生碼，沒有修改舊版業務程式。舊版在新增通知結構下完成顧客課程預約、方案購買與店長核帳；另完成蒸足購買申請及核帳，後端確認新付款觸發器產生待處理通知，核帳後方案開通且通知已結束。
- 停止網站及其他資料庫連線後，先測試不符合條件的回退遭拒，再執行回退審查稿。兩者前後 164 張表資料摘要完全一致，包括剛新增的預約、方案、付款與通知；舊預約函式恢復、新版結構檢查拒絕通過，帳本未修改。
- 回退後以相同舊版原始碼再次啟動網站，另建預約、購買與核帳均成功；蒸足付款繼續正常，不再觸發已移除的新付款通知。獨立還原的合成美業角色在回退前後均可新增／處理通知，禁止刪除、讀取使用者密碼欄位及跨業態寫入；角色探測寫入均回滾。
- 工作區證據：`/workspace/digital-manager-old-version-qa/` 中的 setup-results、rollback-results、browser-before／after、steam-before／after、role-before／after JSON 及截圖。備份含合成帳號資料，僅保留本機，不作為公開交付檔案。測試網站及獨立測試叢集已停止。

限制：舊版以 Next 開發模式執行；使用完整 Prisma schema 加上相關既有／候選 SQL 的合成資料，沒有正式所有自訂 SQL、真實資料或正式備份。此輪選取課程及蒸足代表性流程，未逐一涵蓋音樂、美業完整 UI；沒有切換正式 Vercel 流量、測試正式自訂角色密碼復原或覆蓋正式庫。正式上線仍須核對當時版本、備份及授權，遠端授權排程已於後續隔離 Preview 補驗，見上述工作紀錄；正式／自動排程與新通知表正式角色讀寫仍未驗。
