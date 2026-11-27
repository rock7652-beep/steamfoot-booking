# 蒸管家官方 LINE 白名單 AI 客服（最小版）

基準：main `08d5e00911ec0fc3830b01424316d4177dfe58d2`。
支線：`feat/brand-line-ai-whitelist`。
PR #1596 已停止開發、維持 Draft；其未提交成果保留在原工作區並另存封存 ZIP，沒有套用到此支線。H-TRG 未完成，舊安裝提案不得使用。

## 行為

- 既有品牌簽章識別後，仍從 `handleSteamButlerEvent` 接入。
- 「找到適合方案」只回原方案卡片；「我想了解適合我的方案」不回覆、不呼叫 AI。
- 其他文字必須同時符合 `BRAND_AI_ENABLED=1`、來源 userId 精確命中白名單，且具 reply token 與 webhookEventId，才處理。其餘沿用原行為。
- OpenAI Responses API 只選一個核准 FAQ ID；LINE 回覆只取靜態 FAQ 原文。沒有使用 #1596 的 Preview 判斷、門市工具、帳本或驗收窗口。
- 模型 handoff 回固定文字「這個問題將由專人回覆您，請稍候。」；缺 Key、未知模型、錯誤、拒答、無效 ID、逾時也回相同文字。沒有建立人工佇列或永久接手狀態。
- 只呼叫既有 `replySteamButlerMessage`；既有全域停發與 Preview 外發保護不變。不使用 push。

## 去重及紀錄

先 INSERT 唯一 webhookEventId，成功才呼叫模型／reply。重送或並行重送的唯一鍵衝突立即略過。預設 ERROR 為保守初始結果，成功回覆後才改為 ANSWER／HANDOFF；API 失敗、LINE 失敗維持 ERROR。

這是「至多處理一次」，不是保證送達一次：程序中斷、發送結果不明或紀錄更新失敗時保留 claim，重送也不再次呼叫模型或 LINE。沒有刪 claim、背景重試或第二次 fallback 發送。缺事件 ID 或 claim／發送前紀錄失敗則不外發。

表只含事件 ID、結果、FAQ ID、token 用量、選擇延遲與建立時間；不保存訊息、LINE userId、reply token、Key 或模型原始內容。錯誤用量未知時是 NULL，不能解讀為零費用。`logBrandLineEvent` 只收到結果類型、faqId 與延遲，不接收原始錯誤物件。

## 變更檔案

- `src/lib/brand-ai-faq.ts`：使用者核准的 Q1–Q10，變更須經 PR 審查。
- `src/server/services/brand-ai-provider.ts`：固定來源選擇、strict JSON schema、store=false、最多 256 output tokens、12 秒整體期限、零重試。
- `src/server/services/brand-ai-reply.ts`：白名單、事件 claim、紀錄與 reply。
- `src/app/api/line/webhook/route.ts`：既有品牌分支接線，門市分支不變。
- `prisma/schema.prisma`、下列 migration：一張事件結果表與 outcome enum。
- `src/__tests__/brand-ai-reply.test.ts`、`brand-ai-log.test.ts`、既有 `line-webhook-store-aware.test.ts`：fake transport／fake reply 及真實 SQL 本機演練。

產品新增行數約 360 行（含 FAQ、服務、route 增量、Prisma 與 SQL，不含測試／本文件）；沒有新增管理介面，既有卡片及操作入口維持原樣，無新 RWD 介面。

## 正式 Prisma migration（只準備，未遠端執行）

路徑：`prisma/migrations/20261127140000_brand_ai_reply_log/migration.sql`。

```sql
CREATE TYPE "BrandAiReplyOutcome" AS ENUM ('ANSWER', 'HANDOFF', 'ERROR');

CREATE TABLE "BrandAiReplyLog" (
    "webhookEventId" TEXT NOT NULL,
    "outcome" "BrandAiReplyOutcome" NOT NULL DEFAULT 'ERROR',
    "faqId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandAiReplyLog_pkey" PRIMARY KEY ("webhookEventId"),
    CONSTRAINT "BrandAiReplyLog_nonnegative" CHECK (
        ("inputTokens" IS NULL OR "inputTokens" >= 0) AND
        ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
        ("latencyMs" IS NULL OR "latencyMs" >= 0)
    )
);

-- Server only. No browser/Data API policies are introduced.
ALTER TABLE "BrandAiReplyLog" ENABLE ROW LEVEL SECURITY;
```

沒有瀏覽器政策、其他資料表異動或額外角色授權。部署前須另行核對正式 migration 執行身分與既有伺服器資料庫角色能讀寫此新表；本輪沒有讀取正式資料庫或修改權限。未安裝／不可寫時白名單流程停止，不呼叫模型或發送。

## 由使用者另行設定（本輪全部未設定）

| 名稱 | 用途 |
| --- | --- |
| `BRAND_AI_ENABLED` | 只有 1 啟用；缺少時全部沿用原行為 |
| `BRAND_AI_ALLOWED_LINE_USER_IDS` | 使用者自行設定，逗號分隔；不在 repo、測試或文件放入實際值 |
| `OPENAI_API_KEY` | 使用者自行設定專用 Project 的 Restricted Key 與預算上限；缺少時僅合資格文字回固定提示 |
| `BRAND_AI_MODEL` | 選填；預設 gpt-6-luna，只接受 gpt-6-luna／gpt-5.4-mini／gpt-6.2-sol |

未驗模型的真實帳號可用性或真實 API；不得把環境變數描述為已開通。程式不新增預算帳本，專用 Project 的費用控制由使用者另行核對；不能把僅發通知的 budget alert 當成已生效的硬性阻擋上限。

## 本機驗證與交付限制

新測試、所有直接 Webhook 回歸及試用提醒 contract：119 項通過。OpenAI 全用 fake transport、LINE 全用 fake reply；真實 API／外發均 0。實際 migration 在 PGlite 本機執行，驗證唯一 claim、七欄資料結構、非負約束及無 client RLS 政策下拒絕存取；不是正式 PostgreSQL／雲端驗收。Prisma generate／validate 通過。

ESLint 無錯誤；既有 Webhook 測試檔仍有 11 項原有 unused-argument warnings，沒有擴大修復。完整 TypeScript `tsc --noEmit` 通過；生成主系統、course、beauty 三套 client 後執行，沒有連線資料庫。

尚未合併、部署、執行正式 migration、設定環境變數或真實呼叫。新增 Draft PR 前須避免現有 Vercel／Cloudflare Git 整合自動部署：既有 Vercel config 未排除此新支線，Cloudflare 已對非 main 的 #1596 產生 Workers Builds。沒有為了推送擅自變更任何遠端部署設定。
