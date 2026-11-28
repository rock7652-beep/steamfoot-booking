# 蒸管家官方 LINE 白名單 AI 客服（最小版）

基準：main `08d5e00911ec0fc3830b01424316d4177dfe58d2`。
支線：`feat/brand-line-ai-whitelist`。
PR #1596 已停止開發、維持 Draft；其未提交成果保留在原工作區並另存封存 ZIP，沒有套用到此支線。H-TRG 未完成，舊安裝提案不得使用。

## 行為

- 既有品牌簽章識別後，仍從 `handleSteamButlerEvent` 接入。
- 「找到適合方案」只回原方案卡片；「我想了解適合我的方案」不回覆、不呼叫 AI。
- 其他文字必須同時符合 `BRAND_AI_ENABLED=1`、來源 userId 精確命中白名單、source.type=user（一對一），且具 reply token 與 webhookEventId，才處理。其餘沿用原行為。
- OpenAI Responses API 只選一個核准 FAQ ID；LINE 回覆只取靜態 FAQ 原文。沒有使用 #1596 的 Preview 判斷、門市工具、帳本或驗收窗口。
- 模型 handoff 回固定文字「這個問題將由專人回覆您，請稍候。」；缺 Key、未知模型、錯誤、拒答、無效 ID、逾時也回相同文字。沒有建立人工佇列或永久接手狀態。
- 只呼叫既有 `replySteamButlerMessage`；既有全域停發與 Preview 外發保護不變。不使用 push。

## 去重及紀錄

先 INSERT 唯一 webhookEventId，成功才呼叫模型／reply。重送或並行重送的唯一鍵衝突立即略過。預設 ERROR 為保守初始結果，成功回覆後才改為 ANSWER／HANDOFF；API 失敗、LINE 失敗維持 ERROR。

這是「至多處理一次」，不是保證送達一次：程序中斷、發送結果不明或紀錄更新失敗時保留 claim，重送也不再次呼叫模型或 LINE。沒有刪 claim、背景重試或第二次 fallback 發送。缺事件 ID 或 claim／發送前紀錄失敗則不外發。

表只含事件 ID、結果、FAQ ID、token 用量、選擇延遲、模型名額核准／占用期限與建立時間；不保存訊息、LINE userId、reply token、Key 或模型原始內容。錯誤用量未知時是 NULL，不能解讀為零費用。`logBrandLineEvent` 只收到結果類型、faqId 與延遲，不接收原始錯誤物件。

## 變更檔案

- `src/lib/brand-ai-faq.ts`：使用者核准的 Q1–Q10，變更須經 PR 審查。
- `src/server/services/brand-ai-provider.ts`：固定來源選擇、strict JSON schema、store=false、最多 256 output tokens、12 秒整體期限、零重試。
- `src/server/services/brand-ai-reply.ts`：白名單、事件 claim、紀錄與 reply。
- `src/app/api/line/webhook/route.ts`：既有品牌分支接線，門市分支不變。
- `prisma/schema.prisma`、下列 migration：一張事件結果表與 outcome enum。
- `src/__tests__/brand-ai-reply.test.ts`、`brand-ai-log.test.ts`、既有 `line-webhook-store-aware.test.ts`：fake transport／fake reply 及真實 SQL 本機演練。
- `vercel.json`：僅排除此新支線的 Vercel 自動 Preview，不改 main 或其他支線。

初版產品新增約 360 行；本輪另加名額控制與安全檢查，並新增獨立唯讀前檢工具，以滿足上線準備要求。仍只用同一結果表，不新增控制／驗收場次表、工作台或預算帳本；沒有新增管理介面，既有卡片及操作入口維持原樣，無新 RWD 介面。

## 正式 Prisma migration（只準備，未遠端執行）

路徑：`prisma/migrations/20261127140000_brand_ai_reply_log/migration.sql`。

```sql
BEGIN;
CREATE TYPE "BrandAiReplyOutcome" AS ENUM ('ANSWER', 'HANDOFF', 'ERROR');

CREATE TABLE "BrandAiReplyLog" (
    "webhookEventId" TEXT NOT NULL,
    "outcome" "BrandAiReplyOutcome" NOT NULL DEFAULT 'ERROR',
    "faqId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "modelStartedAt" TIMESTAMPTZ(3),
    "modelLeaseUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandAiReplyLog_pkey" PRIMARY KEY ("webhookEventId"),
    CONSTRAINT "BrandAiReplyLog_nonnegative" CHECK (
        ("inputTokens" IS NULL OR "inputTokens" >= 0) AND
        ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
        ("latencyMs" IS NULL OR "latencyMs" >= 0)
    )
);

CREATE INDEX "BrandAiReplyLog_modelStartedAt_idx" ON "BrandAiReplyLog"("modelStartedAt");
CREATE INDEX "BrandAiReplyLog_modelLeaseUntil_idx" ON "BrandAiReplyLog"("modelLeaseUntil");

-- Server only. No browser/Data API policies are introduced.
ALTER TABLE "BrandAiReplyLog" ENABLE ROW LEVEL SECURITY;
COMMIT;
```

沒有瀏覽器政策、其他資料表異動或額外角色授權。部署前須另行核對正式 migration 執行身分與既有伺服器資料庫角色能讀寫此新表；本輪僅唯讀核對正式 schema／migration catalog，沒有讀取營運紀錄或修改權限。未安裝／不可寫時白名單流程停止，不呼叫模型或發送。

## 由使用者另行設定（本輪全部未設定）

| 名稱 | 用途 |
| --- | --- |
| `BRAND_AI_ENABLED` | 只有 1 啟用；缺少時全部沿用原行為 |
| `BRAND_AI_ALLOWED_LINE_USER_IDS` | 使用者自行設定，逗號分隔；不在 repo、測試或文件放入實際值 |
| `OPENAI_API_KEY` | 使用者自行設定專用 Project 的 Restricted Key 與預算上限；缺少時僅合資格文字回固定提示 |
| `BRAND_AI_MODEL` | 選填；預設 gpt-6-luna，只接受 gpt-6-luna／gpt-5.4-mini／gpt-6.2-sol |

未驗模型的真實帳號可用性或真實 API；不得把環境變數描述為已開通。程式不新增預算帳本，專用 Project 的費用控制由使用者另行核對；不能把僅發通知的 budget alert 當成已生效的硬性阻擋上限。

## 本機驗證與交付限制

本輪 7 份測試共 143 項通過，包含實際 PostgreSQL 17.6 多連線、完整 reply service 的20／21次模型限制、跨日並行、重送去重、交易失敗回滾、最小權限與隔離 grant／回收提案演練，以及直接 LINE Webhook／共用課程／試用提醒回歸。OpenAI 全用 fake transport、LINE 全用 fake reply；真實 API／外發均 0。新表與 enum 的安裝失敗回滾另以 PGlite 驗證。這是本機功能驗收，不是實際 LINE／OpenAI／Supabase runtime 驗收。Prisma generate／validate、完整 TypeScript 與 ESLint 通過。

ESLint 無錯誤；既有 Webhook 測試檔仍有 11 項原有 unused-argument warnings，沒有擴大修復。完整 TypeScript `tsc --noEmit` 通過；生成主系統、course、beauty 三套 client 後執行，沒有連線資料庫。

本輪只推送新支線並建立 Draft PR，不合併、不手動部署、不執行正式 migration、不設定環境變數或真實呼叫。使用者已批准在 vercel.json 僅排除此新支線的 Vercel 自動 Preview，並接受 Cloudflare 在略過設定核對後仍可能隨推送觸發自動建置／部署。Cloudflare 未驗證，不能將其歷史建置失敗當成停用保證；沒有修改 Cloudflare 或任何遠端部署設定。GitHub CI 仍會執行，包括使用一次性 PostgreSQL 的 schema／工單測試，與正式 migration 不同。


## 上線前必要修正（#1598 本輪）

### 每日 20 次與並行 1 次

`brand-ai-quota.ts` 在 READ COMMITTED 短交易內先取得品牌專用 advisory **transaction** lock，再讀取 DB 時鐘，使用既有 date-utils 算出台北日界線，統計 modelStartedAt，原子核准名額。所有 lambda／連線共用同一張表及同一把鎖，不能用單一 process 的記憶體計數。

每日最多 20 個核准名額；無自動重試。失敗、逾時、停止或程序中斷都不清除 modelStartedAt、不返還名額，所以實際模型呼叫不會超過名額。modelStartedAt 是資料庫核准時刻所屬的台北日，不是 LINE 訊息時間／模型完成日。沒有自動重置歷史列；跨日查詢採共用日期工具。

modelLeaseUntil 是 **30 秒的執行占用**，不是驗收窗口。全表仍有效的占用最多一個，包括前一日開始的請求。正常模型完成／錯誤後清空此欄；程序中斷後自行到期，歷史與每日名額仍保留。模型整體 deadline 12 秒（包括名額等待）；取得名額晚於 deadline 或 AbortSignal 已取消時，不能再啟動 API。交易最多 5 秒，**不持有 DB 交易等待 OpenAI 或 LINE**。此限制約束本系統在途請求，不宣稱能取消供應商已接受的運算或撤回既有費用。

超額／忙碌不呼叫 OpenAI，若安全外發仍允許，只回原固定轉真人文字。資料庫錯誤不放寬限制，重送亦不重試原事件。不得為驗收刪紀錄、清除 modelStartedAt 或提高 20 上限。

### 呼叫前與回覆前安全檢查

1. AI 開關必須為 1、來源必須為一對一 user、userId 仍在白名單內。
2. 既有全域 LINE 停發必須已由原有流程合法解除；Preview／未知部署的外部整合封鎖必須不阻擋。
3. 品牌 reply token 與品牌 LINE access token 必須存在；缺少時不先花模型費用。
4. claim 後、真正 fetch 前重新檢查；模型返回後 LINE reply 前再檢查。停止／移除白名單後，不發送已算好的答案。
5. 只沿用 replySteamButlerMessage；不修改全域 LINE_DELIVERY_RESUME_AT，也不新增 Preview 外發繞過旗標。

開關／白名單是部署環境變數，不能保證修改 Vercel 值立即影響既有 deployment。緊急方案見後文，不宣稱免部署的即時開關。

## 唯讀前檢工具（已準備，不會執行 migration）

```sh
node --conditions=react-server --import tsx scripts/brand-line-ai-preflight.ts --config
node --conditions=react-server --import tsx scripts/brand-line-ai-preflight.ts --database --expected-project ttworfzgwejdeolegkxl
```

第二條只可在已明確授權的隔離連線環境執行。Production 另用已核准的正式 project ref；不將 Production URL 複製到隔離設定，不在指令、log 或文件貼連線字串。工具使用既有環境內的 DATABASE_URL，不要求在聊天室提供。

工具檢查目標 ref、禁止 URL 路由覆寫、嚴格 TLS（直接連線使用已核對的既有 Supabase CA，shared pooler 使用系統 CA），只跑 BEGIN READ ONLY／SELECT／ROLLBACK。回報 schema、RLS、role、SELECT／INSERT／UPDATE、advisory lock EXECUTE、索引與聚合名額；能讀 migration ledger 才比對 checksum。runtime 不需要為此新增讀 migration ledger 權限，null 代表由 migration owner 另查。

catalog／SELECT 成功**不是寫入驗收**。前檢若表不存在、不符九欄定義的舊表、migration checksum 不符、TLS／權限／RLS 不符，停止，不自動補 grant、覆蓋已套用 migration、回填或清除資料。本 migration 尚未在遠端執行，故本輪修改同一待審檔案；任何已安裝舊版的證據都會改變安裝方案，須重新列明批准範圍。

本輪管理工具的 READ ONLY catalog 查詢已確認：隔離為 steamfoot-preview／ttworfzgwejdeolegkxl（17.6.1.121），正式為 steamfoot／qijlnhtpbintanzpxkvf（17.6.1.104），server_version 均17.6，新表／enum／本次ledger紀錄均不存在；沒有任何遠端寫入。完整唯讀紀錄見 [前檢證據](brand-line-ai-prelaunch-evidence.json)。管理工具身分是postgres，**不是實際app runtime的認證／TLS驗收**。本機為upstream17.6-alpine，Supabase patch及pooler仍待真實前檢。

本機 PostgreSQL 17.6 使用真實 migration、普通 NOBYPASSRLS runtime、SELECT／INSERT／UPDATE 與單一 server RLS 政策，驗證多連線競爭、失敗回滾及完整 reply service（OpenAI／LINE 仍用 fake）。runtime 沒有 DELETE／TRUNCATE／ALTER。前檢工具也以該角色實際執行 readonly 查詢。不是以模型縮小版或只看程式碼代替。

## 最小執行方案與階段閘門

### A. 已授權本機準備

- 修正一對一、安全前檢、每日硬上限與並行；執行實際 PG17.6 的多連線與 service 流程、migration 失敗回滾、既有 Webhook 回歸、TypeScript、ESLint。
- 更新同一 Draft PR；Vercel 仍排除此支線，Cloudflare 沿用使用者已批准的略過／自動建置風險，不修其設定。
- 不建立 Preview、不解除停發、不設定任何實際 Key／白名單、不呼叫真實 API。

### B. 隔離資料庫前檢與驗收（待整批批准）

目標只限 steamfoot-preview／ttworfzgwejdeolegkxl。先以明確 project ID／既有角色及嚴格 TLS 確認目標與目前 schema，其他模組／舊四店及 #1596 安全狀態不動。

只安裝本次 BrandAiReplyOutcome／BrandAiReplyLog（九欄、PK、兩索引及 CHECK／RLS）；**不在這個歷史隔離庫盲跑全部 prisma migrate deploy**。隔離階段只執行經批准、checksum 固定的本份 SQL，與正式 migration ledger 分開記錄。若任何同名物件／舊 checksum 已存在，停止，不 DROP／CASCADE／自動修復。

既有隔離 runtime 若非 owner／BYPASSRLS，只有在前檢證實缺少時，依 scripts/sql/brand-line-ai/preview-runtime.proposed.sql 提案，最小權限為 BrandAiReplyLog 的 SELECT、INSERT、UPDATE，加一條僅 TO 該既有 server role 的 ALL policy USING(true) WITH CHECK(true)。不授予 DELETE／TRUNCATE／TRIGGER／DDL，不碰 User、Store、AuditLog 或原 #1596 表。正式 runtime 若本來是 owner／BYPASSRLS，無須照抄此 grant。提案只接受該表三項 DML 均尚未授予的基線；回收時依 preview-runtime-revoke.proposed.sql 僅撤本次 policy／三項 DML，保留表與全部歷史。本機已執行原提案（僅將角色名替換為一次性測試角色）及回收／重新安裝驗證。

最多寫入一筆固定 synthetic event claim／model reservation（不呼叫模型、不發訊息），檢查唯一鍵、讀寫、重複請求拒絕及釋放占用；保留該 ERROR 測試列與 modelStartedAt，不退還名額、不提高額度。跨連線搶第20／21筆的完整壓力案例只在一次性本機庫做，不消耗遠端隔離庫 20 個名額。

驗收後只關閉測試程序／清理私有環境暫存；無新增登入帳號、臨時通行連結或窗口政策需要回收。新表與必要合成驗收列保留，不刪其他資料，也不移除仍有紀錄的 enum／表。

### C. Production schema 與停用狀態部署（待整批批准）

1. 固定本 PR 待審 SHA、核對所有 CI、既有正式版本及目前真實 LINE 停發狀態。只允許品牌官方 OA 的既有 Webhook，不修改網址／簽章流程。
2. 正式 project ref 固定為 steamfoot／qijlnhtpbintanzpxkvf，並須再次與既有正式部署來源核對一致；以 migration owner、runtime 分別做唯讀 catalog／checksum／權限前檢，不顯示憑證。DATABASE_URL 與 CLI 使用的 DIRECT_URL 必須各自確認相同目標及嚴格 TLS；不能只確認其中一個。
3. 本輪已唯讀核對正式 ledger：除本次之外，另有 24 份 repo migration 沒有成功 ledger 對應，activeFailures=0。這不證明舊物件不存在；**禁止全量 prisma migrate deploy**。固定待審 SHA／SQL checksum 後，只用 `prisma db execute --file prisma/migrations/20261127140000_brand_ai_reply_log/migration.sql --schema prisma` 套用這一份正式 migration 檔案；schema／enum／索引／RLS 與 checksum 驗證成功，才用 `prisma migrate resolve --applied 20261127140000_brand_ai_reply_log --schema prisma` 登記僅此份為 applied。resolve 不得代替真正安裝，也不得修改／標記其他24份。兩步均是待批准的正式資料庫寫入。若新表／enum／本次 ledger 已存在但不符，停止。新 SQL 具 BEGIN／COMMIT，安裝失敗整筆回滾；若SQL成功但resolve失敗，保持AI關閉、保留新表，重新前檢再處理本次登記，不重跑CREATE或DROP表。
4. 確認表／enum／九欄／PK／兩索引／RLS／runtime 角色及已套用 checksum；不要為方便改 app 全域 DB role 或資料庫有效期。實際寫入驗收與名額只在後續核准測試事件中發生。
5. 既有 scripts/ci-migrate.mjs 在 Production 只有 PRODUCTION_MIGRATION_TARGET 有值才啟動其舊遷移流程；本次不得設定此值。先用配置前檢確認 productionMigrationTargetPresent=false；若原值存在則停止，不擅自清除或沿用舊 target 執行。再核對其他 build gate 沒有新增寫入，才合併原 #1598 至 main，讓原 Vercel 專案產生**一次必要的正式版本**，BRAND_AI_ENABLED 保持 0。正式站其他功能照常，這不是提前開放所有人。若合併本身已自動部署，不另手動建一次。
6. 驗證新 deployment SHA、必要健康檢查及原方案卡片／真人固定文字／非白名單不回覆。若正式全域 LINE 仍停發，停在此處，不修改共用開關來測 AI。

C 是正式環境變更，現階段只準備方案；沒有因本文件而獲准合併、安裝或部署。

### D. Key／白名單／費控與最多三次真實驗收（待整批批准）

- 使用者自行在原專案的 **Production** 設定專用 Project Restricted Key，只給 Responses 所需權限；不重用其他模組的 Key、不發到 Preview／Development，不在聊天室、測試或文件提供實際值。既有程式只有此品牌 provider 讀取 OPENAI_API_KEY；啟用前仍再核對最新 main 沒有新增其他消費者。
- 使用者自行填入一名合成／內部測試者的真實 LINE userId。比對官方 OA 管理介面與該測試帳號，取得本人測試同意；不把任何顧客加入白名單，拒絕 group／room。配置前檢只顯示 presence／人數，不輸出值。
- Project budget alert 不是硬性美元上限，Restricted Key 也不是金額封頂。程式硬限制為每日20次核准名額、並行1、每次最多256輸出tokens／12秒、輸入訊息最多5000字元、零重試。不得重置／提高名額。啟用前以官方當時可用模型／價格確認預估成本；不把舊估算當實際帳單。若使用者要求硬性美元上限而平台沒有可強制限制的設定，保持停止，不能聲稱已做到。
- 第一輪最多 **3 次真實 OpenAI 請求（含失敗，不重試）**：Q1、Q3、未知問題各一次。每筆最多一個 LINE reply、只給該一對一測試帳號，回報 FAQ 原文／固定轉真人與token紀錄。未知問題沒有人工佇列；只能確認固定提示與真人可由既有 OA 工具接續。
- 同一事件重送、20上限、並行、群組、停發、錯誤等負向情境優先沿用 fake transport／本機 PG，不發送20筆付費測試。另測原方案卡片與固定真人文字，皆不得消耗 OpenAI 次數。非白名單以一個另經同意的內部帳號確認無新AI回覆；不操作真實顧客。
- Key／白名單的部署變數應在一次設定中齊備再建立生效部署；不要逐項設定逐項重建。若第一次正式部署無法安全預置，最多需一個受控啟用 deployment，須在執行前列明，不把「儲存 env」當作已生效。
- 測試成功、失敗或中斷，都恢復品牌 ENABLED=0 並以已批准的回復部署確認生效；保留結果表、模型名額與費用紀錄，不回填成功／刪除 ERROR。記錄實際 requests、tokens、估算費用及供應商帳單待核對項目。恢復停用前不得把白名單拓展或宣稱正式營運。

### E. 緊急停止／回復

1. 先撤銷此專用 Restricted Key，停止供應商接受後續模型請求；已接受的請求／費用可能無法撤回，沒有自動重試。這只適用確認專用 Key 的前提，不撤其他模組共用 Key。
2. 同時將 BRAND_AI_ENABLED=0，讓一次核准的回復部署生效，才算完整停止 AI 分支。舊 immutable deployment 不會因 env 儲存即時停下；在完成回復前，固定轉真人提示仍可能出現。回覆前的既有全域停發／白名單檢查依然保留，但不擅改全站 LINE 暫停設定。
3. 30 秒占用自然到期；不清除 modelStartedAt、不刪帳本、不重置每日名額。回滾程式可保留 additive schema；有任何資料時不 DROP 表／enum。
4. 以新／回復 deployment 的來源 SHA、enabled=0配置、測試帳號的新事件無AI回覆及新modelStartedAt不增加確認停止。對照事件時只使用技術事件ID與計數，不輸出原始訊息或userId。

## 整批授權清單（尚未批准執行 B–E）

一次批准需明定：隔離 project／既有 runtime 角色、固定 SQL checksum 與最小單表 grant／policy、一筆合成隔離寫入；正式 project qijlnhtpbintanzpxkvf／migration owner／runtime 的 readonly核對、僅本份SQL安裝及驗證後僅此份Prisma ledger登記；原PR合併與原Vercel專案最多一次停用部署、必要的一次限定啟用部署及一次還原停用部署；使用者本人設定 Production 專用Key與一名白名單；最多3次真實OpenAI／最多3筆AI reply與原固定流程的內部測試；以及不論成功失敗均停用／保留紀錄的回復與專用Key撤銷。所有額度／費用與QA記錄須保留，不以新部署、換帳號或改日期繞過20上限。

任何前檢不符、無法確認停發／費控或部署數超出授權，都停止該依賴步驟；不新增 #1596 式窗口、帳號、通行連結、場次表或外發例外。

本次 migration SQL SHA-256：`d5ef61c40d836deda7d4251d3f514ff0689ddbc597059a4ce8c088d2f7a19f90`。隔離 grant 提案：`d53b891557621b85b72d420076206782162ab0840f0d6104f90f7bda1a1cd1a3`；回收提案：`974afb673e000dac72d41f0a4ec20a345ee0ca5f6282873d484ba2e1f7cd9b08`。以上僅固定待批准內容，未遠端安裝。

## 2026-11-28 原生文字與限定三次手機驗收

品牌 AI FAQ 與轉真人提示使用 `replySteamButlerMessage` 的 `native-text` 選項，
維持核准原文、加入段落換行及完整 HTTPS 網址。未選此選項的既有回覆仍轉 Flex，
「找到適合方案」保留原卡片，固定真人文字、門市通知、停發及 Preview 外發封鎖不變。

單輪驗收另使用選填、僅 Production 的 `BRAND_AI_REPLY_LOG_LIMIT`，其值是**既有
BrandAiReplyLog 全部歷史筆數加本輪授權次數**，不是每日額度。設定錯誤或達上限
時，在模型與發送前靜默停止，不發額外轉真人提示。Claim 在既有 advisory lock
下計數與新增，跨程序、跨日及並行均不重置；失敗、逾時也占一筆，不退款、刪除
或重置歷史。未設定時維持原行為，每日20次模型上限與並行1次限制一直保留。
只有白名單文字 AI 路徑會消耗此上限，既有方案卡片不會。

本輪唯讀前檢歷史4筆、模型4次、活動0；正式啟用前須再核對仍為4筆，才設定
上限7。若前檢不同，停止啟用並重新核對，不能直接沿用7。只沿用本人已設定的
單人白名單及 Restricted Key，不讀出秘密值或修改門市設定，不新增 migration。

驗收問題依序為「蒸管家是什麼」、「可以免費試用嗎」、「方案價格？」；第四項
僅輸入精確固定命令「找到適合方案」核對 Flex，不呼叫模型。超過三筆 AI 事件
將靜默停止；不要因暫無回覆反覆重送。試用與價格網址須由本人在手機實際點擊。

發布先取得 CI 通過的合併 SHA；停用版與限定啟用版為不同環境設定，各只建置
一次。停用版先驗 READY／公開 HTTP，記下部署ID。啟用版 READY 後再核對歷史、
上限與公開 alias，才通知本人測試。收尾將 Production AI開關設回0，重用本次
同SHA停用部署並核對全部公開 alias，不新增還原建置。若建置失敗，不盲目重建；
啟用前失敗保持停用，啟用後中斷則先還原。帳本保留，不輸出完整LINE userId。

本機 fake transport與一次性PG17.6多連線測試不代表雲端／實機驗收；實機結果
在實際測試後另記，不以payload通過代替網址點擊成功。
