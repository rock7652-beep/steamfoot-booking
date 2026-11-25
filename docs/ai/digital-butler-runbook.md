# AI 數位店長開發與部署 Runbook

目前是隔離開發候選，不是正式上線指南。架構、成本與隱私以 [工程契約](digital-butler-core.md) 為準。

## Shared Session Pooler 已確認（2026-11-25）

使用者已從官方介面確認 `aws-1-ap-northeast-1.pooler.supabase.com:5432`、database postgres。測試 username 為 `steamfoot_ai_preview_20261125.ttworfzgwejdeolegkxl`。不再使用 aws-0，也不購買 IPv4 add-on。

既有 Sensitive DB 值不可回讀，沿用其中的角色與密碼；新增僅本 AI Preview 支線的 `AI_PREVIEW_POOLER_MODE=shared-session-aws1`。共用後端 URL builder 先驗證原連線的隔離專案、完整 Vercel tuple 與專用角色，再固定套用此已確認 Host／5432／session mode（pgbouncer=false）；保留密碼、單連線限制與嚴格 TLS／固定指紋公用 CA。不接受任意 Host、錯模式或管理角色，不將正式憑證重寫為測試 Host。DIRECT_URL 原始 Sensitive 值不變；本支線所有自動 migration 仍跳過。

此設定不會熱更新既有部署；待本機檢查通過後，只做本版本所需的一次驗收建置，再實際驗證角色登入、AI stop、Mock 與最小真實 API。以下 Dedicated／尚缺 Host 是先前歷史紀錄。

## Dedicated Pooler 核對補充（2026-11-25）

使用者已從 Connect 確認 `db.ttworfzgwejdeolegkxl.supabase.co:6543` 是 Dedicated PgBouncer、資料庫 postgres、預設 IPv6。此模式的測試 username 為裸角色 `steamfoot_ai_preview_20261125`；Shared Supavisor 才加 `.ttworfzgwejdeolegkxl`，不可混用。

DNS 查無 IPv4 A、查得 IPv6 AAAA；本執行器對此端點 TCP 連線回 ENETUNREACH（101），未完成 TLS 握手或角色密碼驗證。Supabase 2026-11-04 的官方相容性文件明列 Vercel 為 IPv4-only，因此未為已知不相容的 Dedicated 路徑另建置。既有 guard 目前亦不接受 Dedicated 6543；沒有為不可用路徑放寬。嚴格 TLS、固定指紋公用 CA、隔離角色與通知封鎖維持。

官方資料確認每個專案都有 IPv4 Shared Pooler；應取得 Connect 的 Session pooler／Shared Supavisor Host，不能從 region 或 Dedicated Host 推算索引。現有 API 工具只有 Direct Host，未暴露官方 pooler config 讀取端點，也無已登入管理瀏覽器。先前成功 Preview、支線與 Sensitive 變數排查限制仍適用。尚待該 Shared Host；未購買 IPv4 add-on、未改環境變數／角色權限，新增建置 0、模型請求 0、global stop=true、四店 enabled=false。Mock／真實 API 仍等待實際 DB 連線與權限驗證通過。

來源：https://supabase.com/kb/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP 及 https://supabase.com/docs/guides/database/connecting-to-postgres 。

## 2026-11-25 最新阻擋：Pooler 路由

修正版 `912c64c60aaf655057655f6f44b117eba605272e` 已部署 READY（`dpl_A58y7dAd23QEmaALRSuvgMJrrD6H`），全量 CI 1,851 檔／17,478 項通過、337 項跳過，型別、lint、目標與相關 PostgreSQL 整合通過。嚴格 TLS／固定 CA 已通過握手；實際登入入口仍回 500，原因改為 `ENOTFOUND tenant/user`。目前 `aws-0-ap-northeast-1.pooler.supabase.com` 無法配對此隔離專案與角色；不能僅依 region 猜 `aws-1` 或以此錯誤推定密碼錯誤。

已核對成功的近期 Preview 建置／runtime logs、五條既有支線變數及早期 QA 記錄；可讀來源沒有正確 Host。共用 Preview DB 是 Sensitive，API 不回傳值；舊 QA 部署／專案已不存在，目前僅一個 steamfoot 專案。其他可讀連線不屬此隔離專案，未使用、未輸出密碼或完整字串。Supabase project API 只有 Direct Host，現有工具無 pooler config 或已登入管理瀏覽器能力。角色與連線格式正確、LOGIN／有效期／CONNECT／schema USAGE 通過；仍需 Supabase Connect 顯示的正確 Host 才能繼續。

DB global stop=true、enabledStores=0、requests=0；未做真實 OpenAI 呼叫。保留 SSO，手動測試短期通行憑證已撤銷，暫存密碼與 session 檔已刪除。未再觸發建置或改用正式 DB；正式環境未變。精確來源與限制見 `artifacts/ai-digital-butler/preview-runtime-20261125.json`。以下進度及初次準備段落保留為歷史紀錄。

## 既有環境與守衛

- Repo：`rock7652-beep/steamfoot-booking`，branch `feat/ai-digital-butler-core`。
- 唯一共用 Vercel Project `steamfoot-booking`（`prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`）；team `rock7652-2111s-projects`。
- 沿用現有 Supabase `steamfoot-preview`：`ttworfzgwejdeolegkxl`，非正式 `qijlnhtpbintanzpxkvf`。
- Git branch 自動部署在 vercel.json 明確 false；未更改全專案自動部署、Build Machine 或正式站設定。
- prebuild、ci-migrate、既有共用 runtime dispatcher 與 database URL builder 均核對精確環境；cached client 也不能略過。拒絕 Production、錯 repo/project、Cloudflare claim、次要 Beauty/Addons 正式連線或 migration target。
- 三個業務 client 最終經共用 URL builder／dispatcher；Beauty 必須 legacy 且不含專用憑證，Addons 專用連線不得繼承。LINE/Messenger/Email 原外發守衛加上 AI branch 強制封鎖；Preview cron 不可移至正式排程執行。
- 現行 Vercel 專案 SSO 保護涵蓋所有 Previews。不得為測試解除保護或公開分享帶密鑰網址。

## 2026-11-25 Preview 實測進度

使用者已親自設定 OPENAI_API_KEY；只核對 Sensitive、Preview、指定支線的中繼資料，未讀取金鑰。驗收用 AI flags 已載入為 1，但 DB global stop 仍為 true、四店 enabled=false、模型請求數 0。

- `a0c0aee` 全量 CI：1,851 檔／17,476 項通過，337 項跳過；型別、ESLint、目標與相關 PostgreSQL 整合通過。Cloudflare 額外建置失敗原因仍未取得。
- 首次 Vercel build `dpl_F4BD6TcefvN8R5irmjWke67kP8yA` 完成編譯，但 `_middleware` 255.77 MB 超過 250 MB，部署失敗。只在本 AI Preview 支線加 `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` 後，第二次 `dpl_87xcqDrJ2y8XBYCnbxPmqftoknVj` READY。沿用既有 Turbo，未變更專案 Build Machine。
- 第二次實際 GET `/hq/login?store=ai-preview-steamfoot` 回 500；runtime log 證實是 Prisma 嚴格 TLS 不信任 Supabase CA。沒有關閉 TLS 驗證；修正為 AI Preview 專用載入既有指紋固定的公用 CA，並在 Next config 入口補完整隔離檢查，等待修正版部署驗證。
- 新增四個 `ai-preview-owner-*` 合成店長與 Staff／ShopConfig；未複製營運帳號。`preview-auth-scope.sql` 僅讓受限角色讀取四店及四帳號，並寫入配對合成帳號的 SUCCESS 登入稽核，不增加 Booking 或營運寫入權限。

## 初次環境準備紀錄（歷史狀態）

2026-11-25 已把 `preview-install.sql` 與 `preview-fixtures.sql` 安裝到上述隔離 DB，新增四張私有 AI 表與四家 `ai-preview-*` 合成店。沒有執行正式 migration、複製顧客或修改既有店家。

新增受限角色 `steamfoot_ai_preview_20261125`，無 superuser、bypass RLS、建庫或建角色能力；只讀既有隔離 schema，AI 寫入受四家合成店 RLS 約束，不能寫 Booking。role 本身具備的權限不取代應用層跨店驗證。

2026-11-25 使用者已在本 chat 明確「批准」憑證傳送，前次自動審查阻擋已解除，**不要重新要求同範圍批准**。已為此角色產生新密碼，並把 DATABASE_URL、DIRECT_URL、AI_IDENTITY_SECRET 設為 Sensitive，僅綁定 `feat/ai-digital-butler-core` Preview。另補外發封鎖、Beauty legacy／通知關閉、AI 與 OpenAI 測試關閉及有期限的費率設定，共 10 個本支線專屬變數；未更改 Production、Development 或其他 Preview 支線。

角色已啟用 LOGIN，有效至 **2026-12-02 22:15:52（台灣時間）**。global stopped=true、所有合成店 enabled=false、請求數 0。已用實際設定通過隔離 URL guard，實際 migration runner 確認跳過所有 migration。OpenAI Key 尚未設定，也未執行雲端建置。

本機對隔離 pooler 的 5432／6543 連線回 ECONNREFUSED 或逾時；不把設定檢查當成密碼驗證／網路登入成功。Supabase connector 已確認 schema、角色權限、RLS 與停止狀態，但其管理連線不能 SET ROLE 為此新角色，未透過額外 admin membership 繞過。實際網路登入、合成帳號及後台 Mock 必須在必要的 Vercel Preview 驗證完成，通過前不解除全域停止或開模型。

## 已批准範圍內的下一階段步驟

1. 憑證與有期限的 LOGIN 已完成。後續持續核對遠端 branch/head、自動部署 false、專案身份、SSO；不要解除 BYPASSRLS 限制或增加營運寫入權限。
2. 下表除 OpenAI Key 外已完成本支線設定。不得覆寫 Production、Development、所有 Preview 或其他支線。維持沒有額外 Beauty/Addons DB secret。
3. 全部連線的 project ref、role、URL allowlist 及角色目錄 postflight 已確認。執行環境的角色網路登入與合成登入帳號尚待必要 Preview 驗證；若需建立，只新增隔離合成帳號，不改真實帳號或寄通知。
4. 支線隔離設定與目錄守衛已確認，可以一次性請使用者到 [Vercel 環境變數](https://vercel.com/rock7652-2111s-projects/steamfoot-booking/settings/environment-variables) 自行設定 `OPENAI_API_KEY`，Type Secret/Sensitive，僅該 branch Preview。不得貼到聊天、Git、PR、文件、fixture、前端或 Log，沒有 NEXT_PUBLIC 前綴。
5. 全部本機檢查與 Key 設定確認後，先集中該次驗收需要的 runtime flags，再核對同 SHA 沒有可重用 Preview，做一個必要的隔離建置。環境變數不會熱更新舊部署，不為先 Mock、後真實測試而分拆相同 SHA 建置；全域 DB stop 與店家開關保持關閉到實際連線驗證通過。說明 Vercel 可能費用；不改全專案 machine，也不為看畫面重建。若 API 支援單次 Enhanced，再於該次必要 build 使用並記錄，否則維持現狀。
6. Key／本機 Mock 與費率配置確認後，若同次部署要驗真實 API，可在第 5 步一併載入 AI_DIGITAL_BUTLER_ENABLED=1、AI_OPENAI_TEST_ENABLED=1；載入可用選項不代表已呼叫模型。實際連線與權限驗證通過後，僅在隔離 DB 明確解除 global stop，店家自行開啟 TEST；依序先完成認證後 Mock，再明確選 OpenAI 做一次 Luna 營業時間情境；token／成本／結算與安全失敗都檢查。不自動測三模型或重試未知請求。
7. 相容性、用量、預算、跨店、人工接手與六尺寸通過後交付 Preview；保持正式 AI 關閉，等待獨立正式發布授權。不得將連著隔離 DB 的 Preview 直接 promote。

| Key | 候選值／處理 | Type |
| --- | --- | --- |
| DATABASE_URL / DIRECT_URL | 新角色、精確隔離 DB；兩者顯式綁本支線，禁止繼承正式值 | Secret/Sensitive |
| AI_DIGITAL_BUTLER_PREVIEW | 1（已設定） | Plain |
| AI_EXTERNAL_DELIVERY_DISABLED | 1 | Plain |
| BEAUTY_DATABASE_MODE | legacy | Plain |
| BEAUTY_NOTIFICATIONS_ENABLED | 0 | Plain |
| AI_IDENTITY_SECRET | 新產生至少 32 字元；只做本支線 HMAC | Secret/Sensitive |
| AI_DIGITAL_BUTLER_ENABLED | 已設 0；Mock 執行條件確認後才改 1 | Plain |
| AI_OPENAI_TEST_ENABLED | 已設 0，Key／費率／Mock 確認後才 1 | Plain |
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
