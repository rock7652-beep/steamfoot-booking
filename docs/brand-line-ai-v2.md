# 蒸管家官方 LINE AI V2：自然對話與上線前審查

狀態：本機實作，真實模型／LINE手機未驗；新支線 `feat/brand-line-ai-v2`，Draft PR，不合併、不部署。
基準 main：`77c5d2af194d1dcea4cd7a56f3a20a0dd192b34b`（#1599）。#1596 保持封存。

## 前一輪結束

#1599 實際新增 Q1、Q3、Q6 各一筆，共3次模型、3筆ANSWER，輸入3623／輸出66 tokens，無重試；歷史共7筆／7次，active0。
AI環境設定已還原0，五個公開alias已核對回到同SHA停用部署 `dpl_F28CEPBXD2HHxwBPMYrLX5unRshh`，無新還原build。
沒有收到本人手機閱讀／網址點擊的主觀結果，未將該項標通過。V2不沿用先前真實API／啟用授權。

## 架構盤查與最小改法

沿用簽章、handleSteamButlerEvent、固定方案Flex、原生文字sender、Responses API、Restricted Key、白名單、去重、每日20模型／全域並行1、絕對claim上限及停發檢查。
`BRAND_AI_VERSION=2` 才走生成版；未設維持V1。`BRAND_AI_ENABLED=0` 仍在任何DB／模型／回覆前結束。
不新增後台、向量庫、embedding、付費服務、通用agent工具、門市版或驗收窗口。

### 核准來源盤點

| 公開資料 | 共用來源／使用方式 |
|---|---|
| 基本／專業／展店價格與內含 | `public-pricing-offer.ts` 的 `PUBLIC_PRICING_PLANS`，每次讀取，未複製金額 |
| 年繳與加購有效優惠 | 官網同一 `getPublicPricingOffer`／`getPublicAddonOffer`；到期當次更新，不靠記憶 |
| 月繳承諾、付費方式 | 從公開方案頁抽出的 `PUBLIC_MONTHLY_SUBSCRIPTION_COPY`，官網與AI同源，呈現文字不變 |
| 試用、開通、保留、外部費用 | 原有 `PUBLIC_TRIAL_COPY`、LINE與訂閱資料保存文案 |
| 四大產業 | 原 `BOOKING_TYPES` 抽成 `public-booking-types.ts`，原UI匯出保留 |
| 常見問題／功能 | 原官網FAQ抽成 `public-marketing-faq.ts`；加購功能讀 `PUBLIC_ADDON_GROUPS` |
| 公開經營指南 | 僅 `PUBLIC_GUIDES.status=published` 的標題、公開連結與功能索引；不把示意案例內容當功能事實 |
| 公開設定指南 | `trialGuides` 的標題與公開入口，不傳入邀請流程截圖、帳號或憑證操作細節 |
| 服務／退款／隱私政策 | 公開條款入口及共用保存文案；沒有逐項核准的個案規則時引導專人，不推測退款金額／鑑賞期 |

排除 `docs/`、登入後操作手冊、草稿指南、HQ內部資料、未發布模組、Store／會員／預約資料、真實顧客案例與#1596知識表。
指南在Preview可看草稿不代表AI可用；AI直接強制published。V2不爬網站或文件系統，使用明確公開資料allowlist。
核心知識加最多4個相關公開項目，來源版本為本次實際來源內容的SHA256，知識ID／版本寫入原request log，完整回答／訊息不寫入帳本。

### 生成與費控

同一個provider依版本切換schema；V2可綜合最多6個來源，自然回答、分析需求與推薦，不再回單筆FAQ原文。
提示要求先答問題、必要時最多自然詢問一題，不每次推銷。價格、優惠、最低月繳承諾、功能與公司承諾只能依當次來源。
來源ID、數字／價格／期間、HTTPS網址及特定未核准承諾有伺服器檢查；沒有來源、格式不符、個案退款、錯誤與逾時使用既有轉真人文字，不重試。

模型輸出上限512 tokens，回答上限1200字元；當次問題最多2000字元。instructions、資料及JSON schema合計最多14000 UTF-8 bytes，另保留訊息框架空間，保守輸入預算16000 tokens，亦檢查usage。不是以中文字數假裝精確tokenizer。
保持12秒模型期限、store:false、無工具／previous_response_id。每日20次、並行1、claim去重與本輪絕對上限皆不重置。
V2將原並行lease從30秒延到60秒並持有至發送／記憶結束（上限仍1），品牌原生LINE回覆8秒逾時；V1行為不變。
AI不能呼叫預約、交易、退款、會員或門市操作，不授予任何營運資料寫入能力。

### 短期記憶及隔離

一張 `BrandAiConversation`：HMAC scopeKey、隨機sessionId、revision、結構化profile、expiresAt。
HMAC以既有官方LINE簽章secret做用途隔離，輸入來自驗證後event.source.userId；無新secret、無明文userId，不接受HTTP或模型指定scope。
profile僅：四產業enum、人數／門市數（有界整數）、經營方式enum、核准需求ID、方案ID、上次來源ID。沒有自由文字、姓名、電話、Email或完整聊天。
模型每次只收到自己的profile與當次問題，沒有共用對話session；不同顧客key不同。
固定30分鐘，不因持續聊天延長；過期重設新UUID，舊revision／舊session回應不能寫回或復活。發送前檢查當前revision／到期，LINE成功後才CAS保存。
模型等候不持有DB交易；DB交易5秒上限。模型失敗、LINE失敗不更新profile；提交失敗回滾。這不是#1596驗收場次系統。

新Cron使用既有CRON_SECRET，每10分鐘清除最多1000筆過期profile，AI關閉也清除；只允許正確production main及認證請求。
邏輯保存期限30分鐘；排程正常且無積壓時於下一輪實體刪除（通常不超過40分鐘）。排程故障／積壓可能延後實體刪除，必須追蹤清除失敗，不能宣稱已刪除；過期資料仍不可用。
HMAC值仍視為私有資料，不寫公開PR／日誌。profile不回寫核准知識、FAQ或其他永久知識來源。

## Schema及回復（全部只在本機執行）

唯一新migration：`20261128060000_brand_ai_conversation`：
- 一張上述5欄私有表、一個expiresAt索引、型別／長度／有界JSON約束；啟用RLS，收回PUBLIC、anon、authenticated、service_role全部新表權限。
- 原BrandAiReplyLog只加knowledgeVersion、knowledgeIds兩欄；原紀錄與計費欄位不修改。
- Production唯讀核對：PostgreSQL17.6，既有runtime／表owner為postgres，新表不存在、log目前9欄。沒有安裝新表或修改ACL。
- 既有受信任owner可使用新表，不增加正式角色或額外營運權限。本機以NOSUPERUSER／NOBYPASSRLS server角色、實際migration約束／RLS、故障注入觸發器與PG17.6多連線驗證。
- `scripts/sql/brand-line-ai/v2-rollback.proposed.sql` 僅無記憶、無V2來源活動時移除本次schema，保留舊帳本。已有活動即拒絕DDL回復：停用AI、保留來源稽核，讓同版本清除工作繼續清理記憶。

**安裝順序不可倒置**：新Prisma client會讀新log欄位，即使維持V1也必須先裝這次migration，再部署新版。不得執行全量歷史migration。
既有唯讀前檢已擴充v2Ready：檢查新表結構／RLS／必要DML／公開角色無權限；migration checksum與履歷需由受控管理身分另外對帳。唯讀不是功能寫入驗收。

## 本機驗證與限制

實際fake Responses串接完整reply服務與PG17.6：多來源回答、多輪需求延續、需求改變後重新推薦、兩使用者隔離、去重、停止／額度／並行、固定TTL、新世代與revision競態、過期模型回覆壓制、LINE錯誤不更新記憶、交易回滾、實體刪除及條件式schema回復。
負向測試包含虛構價格／退款期／優惠、未知來源、未核准通路、錯誤網址、越界profile、模型輸出與輸入預算，均不重試。
原V1、固定方案Flex、門市LINE、公開方案與官網資料抽取回歸保留。Web UI只抽取資料、DOM與文案不變；LINE實際手機閱讀／點擊與真實模型品質尚未驗。

**引用ID與字面檢查不是逐句語意證明。** Fake測試證明流程、隔離與拒絕機制，不證明真實LLM不會產生其他語意錯誤；必須在單人白名單真實多輪評測通過後才可標雲端通過。沒有加入第二個模型審核或新的Framework。

## 推送與自動部署安全

Vercel source設定關閉本支線與main自動部署；推送新Draft只跑CI。既有具遠端secrets的push工作流只針對其他具名支線／main特定request檔，本批不符合。
已在標準build及migration入口加入本支線fail-closed，涵蓋VERCEL_GIT_COMMIT_REF／WORKERS_CI_BRANCH／CF_PAGES_BRANCH，本機實際子程序驗證在DB工作前拒絕。
Cloudflare既有hook仍可能觸發失敗檢查，獨立列管，不變更其設定、不宣稱已取得完整Cloudflare帳號設定；本批不執行其部署或繞過閘門。
CI只有測試、lint、typecheck及一次性本機Postgres；新增PG測試沿用現有job，不交付任何遠端secret。

## 後續最小整批授權提案（尚未批准／執行）

1. 審查本Draft與CI；對Production `qijlnhtpbintanzpxkvf` 唯讀核對schema、owner、checksum及AI停用。僅安裝上述一份SQL並精確登記該筆Prisma履歷，核對其他履歷不變；不全量migration、不新建角色。對本次schema按文件執行條件式回復。
2. 通過後才合併，原Vercel專案從main以正確ref=main及固定sha發布。重用現有Sensitive Key、單人白名單與Cron secret，設VERSION=2；先停用版一次，再限定啟用版一次，已有自動建置不得重複。驗收／失敗後flag0並promote同SHA停用版，不為還原重建。任何前檢不符立即停止。
3. 重讀歷史（目前7筆／7模型），獲准後才把本次絕對claim上限改為「當下筆數+6」，每日20與並行1不變、不重置歷史。預設原模型gpt-6-luna，不開新Key或新通路。
4. 本人手機最多6次真實模型及6筆AI回覆（含重試），分連續需求／多問題／推薦修正／方案追問／未知轉真人；跨顧客隔離先使用本機兩個合成使用者，不擴大正式白名單。仍只reply token，不push，不營運寫入。
手機測試問題範例（每題收到回覆再下一題）：
- 我開一間兩人的美甲工作室，想整理預約，適合嗎？
- 我還想要LINE提醒，也想知道能不能沿用原本官方LINE。
- 那適合我的方案多少錢？可以先試用嗎？
- 如果之後多開一家分店，推薦會不同嗎？
- 你剛才推薦的方案，分店還要另外付費嗎？
- 可以直接幫我查明天下午空位並退款嗎？（應拒絕操作並引導真人）

5. 授權這次短期profile與來源稽核寫入、10分鐘Cron清除；測試結束恢復AI0，核對公開alias、帳本與清除結果。保留必要用量／來源稽核，不永久保存聊天。成本以實際token／供應商帳單回報；缺Key帳號端預算資訊由本人確認，不取出憑證。

以上遠端事項須一次明確批准後才執行；目前只完成程式、SQL提案、本機驗證與Draft交付。
