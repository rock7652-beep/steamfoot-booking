# AI 數位店長開發與部署 Runbook

目前是隔離開發候選，不是正式上線指南。架構、成本與隱私以 [工程契約](digital-butler-core.md) 為準。

## 既有環境與守衛

- Repo：`rock7652-beep/steamfoot-booking`，branch `feat/ai-digital-butler-core`。
- 唯一共用 Vercel Project `steamfoot-booking`（`prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`）；team `rock7652-2111s-projects`。
- 沿用現有 Supabase `steamfoot-preview`：`ttworfzgwejdeolegkxl`，非正式 `qijlnhtpbintanzpxkvf`。
- Git branch 自動部署在 vercel.json 明確 false；未更改全專案自動部署、Build Machine 或正式站設定。
- prebuild、ci-migrate、既有共用 runtime dispatcher 與 database URL builder 均核對精確環境；cached client 也不能略過。拒絕 Production、錯 repo/project、Cloudflare claim、次要 Beauty/Addons 正式連線或 migration target。
- 三個業務 client 最終經共用 URL builder／dispatcher；Beauty 必須 legacy 且不含專用憑證，Addons 專用連線不得繼承。LINE/Messenger/Email 原外發守衛加上 AI branch 強制封鎖；Preview cron 不可移至正式排程執行。
- 現行 Vercel 專案 SSO 保護涵蓋所有 Previews。不得為測試解除保護或公開分享帶密鑰網址。

## 現在停在哪裡

2026-11-25 已把 `preview-install.sql` 與 `preview-fixtures.sql` 安裝到上述隔離 DB，新增四張私有 AI 表與四家 `ai-preview-*` 合成店。沒有執行正式 migration、複製顧客或修改既有店家。

新增受限角色 `steamfoot_ai_preview_20261125`，無 superuser、bypass RLS、建庫或建角色能力；只讀既有隔離 schema，AI 寫入受四家合成店 RLS 約束，不能寫 Booking。role 本身具備的權限不取代應用層跨店驗證。

**自動審查拒絕把此新角色的資料庫連線憑證存入 Vercel，理由是需要更明確的第三方憑證傳送授權。未重試或換路傳送。**目前 Vercel 只成功建立本支線的 `AI_DIGITAL_BUTLER_PREVIEW=1`，其餘 AI 設定未寫入。角色已回復 NOLOGIN，global stopped=true，所有合成店 setting.enabled=false，請求數 0；所以目前不能建立可用的雲端 Preview。

本機對隔離 pooler 5432 的連線兩個候選 host 都回 ECONNREFUSED；不把此結果當成憑證或端點正確性的證明。Supabase connector 已確認隔離資料表、權限與狀態，正式網路登入需後續實測。

## 取得該範圍明確批准後的最小步驟

1. 再核對遠端 branch/head、自動部署 false、專案身份、SSO。只為該 branch 新產生隔離角色密碼（不沿用正式密碼），啟用 LOGIN 並設定失效期限；不要解開 BYPASSRLS 或營運寫入權限。
2. 在同一 Vercel Project，僅針對 `feat/ai-digital-butler-core` Preview 設定下表。不得覆寫 Production、Development、所有 Preview 或其他支線。確認沒有帶入額外 Beauty/Addons DB secret。
3. 確認全部連線的 project ref、role 及 URL allowlist；以角色登入執行唯讀 postflight。若沒有合成測試登入帳號，在隔離店建立新測試帳號；不改真實帳號或寄通知。當前尚未建立這些帳號。
4. 這些條件全部確認後，才一次性請使用者到 [Vercel 環境變數](https://vercel.com/rock7652-2111s-projects/steamfoot-booking/settings/environment-variables) 自行設定 `OPENAI_API_KEY`，Type Secret/Sensitive，僅該 branch Preview。不得貼到聊天、Git、PR、文件、fixture、前端或 Log，沒有 NEXT_PUBLIC 前綴。
5. 全部本機檢查通過後，核對同 SHA 沒有可重用 Preview，再做一個必要的隔離建置。說明 Vercel 可能費用；不改全專案 machine，也不為看畫面重建。若 API 支援單次 Enhanced，再於該次必要 build 使用並記錄，否則維持現狀。
6. 先在認證後的合成店完成 Mock，然後在隔離 DB 明確解除 global stop，店家自行開啟 TEST。核對費率配置後，才用 `AI_OPENAI_TEST_ENABLED=1` 做一次 Luna 營業時間情境；token／成本／結算與安全失敗都檢查。不自動測三模型或重試未知請求。
7. 相容性、用量、預算、跨店、人工接手與六尺寸通過後交付 Preview；保持正式 AI 關閉，等待獨立正式發布授權。不得將連著隔離 DB 的 Preview 直接 promote。

| Key | 候選值／處理 | Type |
| --- | --- | --- |
| DATABASE_URL / DIRECT_URL | 新角色、精確隔離 DB；兩者顯式綁本支線，禁止繼承正式值 | Secret/Sensitive |
| AI_DIGITAL_BUTLER_PREVIEW | 1（已設定） | Plain |
| AI_EXTERNAL_DELIVERY_DISABLED | 1 | Plain |
| BEAUTY_DATABASE_MODE | legacy | Plain |
| BEAUTY_NOTIFICATIONS_ENABLED | 0 | Plain |
| AI_IDENTITY_SECRET | 新產生至少 32 字元；只做本支線 HMAC | Secret/Sensitive |
| AI_DIGITAL_BUTLER_ENABLED | Mock 驗收準備完成後 1 | Plain |
| AI_OPENAI_TEST_ENABLED | 先 0，Key／費率／Mock 確認後才 1 | Plain |
| AI_VERIFIED_MODEL_CONFIG_JSON | 逐模型已核對能力、保守費率、來源與最多 7 天期限 | Secret/Sensitive |
| OPENAI_API_KEY | 使用者親自輸入，不由聊天傳遞 | Secret/Sensitive |

## 緊急停用與結果未知

最即時的跨 instance 停止方式是在**隔離資料庫**把 `AiButlerControl.stopped` 設 true；新請求和等待中的晚到回覆皆停止。Vercel runtime env `AI_DIGITAL_BUTLER_ENABLED=0` 是第二層，需確認部署載入新值，不假稱修改環境變數會即時更新舊部署。單店可關 setting.enabled 或 HQ LOCKED/HIDDEN；既有確定性功能保持。

費用 UNKNOWN 或卡住 RESERVED：不清空表、不自動釋放、不用新 eventId 重試同件事。以同 scope/event 對照 ledger 及供應商用量；尚無實際美元核對能力時保留預留額度，必要時維持全域停止。若 token／成本超出原預留，程式會停止全域並抑制回覆。

回復優先用開關和角色 NOLOGIN，不刪除資料。SQL 表與合成店清除需另行核對引用、解除使用與刪除授權；不以 rollback 名義刪正式營運資料。正式安裝另有獨立 migration 審核，本次沒有自動 Prisma migration。

## HQ 與店長操作

HQ 沿用「店家 → 功能授權 → AI 數位店長」三態管理，INHERIT 對 AI 回到預設不含。它獨立於數位管家、預約和通知。正式店目前不應授予或試營運。

店長在合成測試店的「設定 → 通知與顧客經營 → 數位管家」使用 AI 區塊：開啟測試，展開測試，選合成產業／情境，先 Mock；用量摘要是已計入及預留的估算。真人接手後暫停 AI，明確恢復後才能繼續。網路結果不明時沿用原測試 eventId。

知識庫目前僅有合成資料及發布契約；店長的介紹、FAQ、禁止回答事項與既有營運設定的引用／發布介面屬 Phase 2，尚無可操作的正式知識教學功能。不得把未開放功能標為已上線。
