# AI 數位店長隔離 Preview Runbook

目前核心及 Phase 2 店家知識管理已完成合成 TEST 驗收；正式客服未開放。架構與安全契約以 [工程契約](digital-butler-core.md) 為準，最新實測見 [知識管理驗收](digital-butler-knowledge-acceptance.md)；[Phase 0/1 歷史](digital-butler-acceptance.md) 保留。

## 已驗證版本與目前狀態

- PR [#1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)，支線 `feat/ai-digital-butler-core`。
- 程式／Preview SHA：`0a094209baf7858eff55c0feb47cb77c552cf302`；後續純文件／證據提交以 PR head 為準，不另建相同程式 Preview。
- [受保護 Preview](https://steamfoot-booking-jn6wva5bq-rock7652-2111s-projects.vercel.app)，deployment `dpl_HbC6fvk9u8ud8gJcCz4qh8iG9LNc`，READY。
- 2026-11-26（台灣時間）完成核心與知識管理的隔離登入、發布／撤下、來源引用、Mock、最小真實 API、帳本與 RWD 驗收。
- 收尾狀態：**global stopped=true、四店 enabled=false**，40 筆請求全部 COMPLETE，RESERVED／UNKNOWN 0；37 筆 Mock、3 筆 OpenAI，累計保守估算 US$0.001310。本輪新增 27 Mock、1 API（US$0.000703），不是供應商帳單。
- 本輪手動建立的測試通行憑證均已撤銷，四個合成帳號登入版本已更新，暫存密碼／session 檔已刪除；SSO 保留。
- 沒有變更 Production、Development、其他 Preview 支線或正式 DB，沒有正式 migration、真實 LINE／Messenger／Email 外發、新專案或 IPv4 add-on。

## 連線與隔離範圍

| 項目 | 設定 |
| --- | --- |
| 既有 Vercel Project | steamfoot-booking / prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR |
| 隔離 Supabase | steamfoot-preview / ttworfzgwejdeolegkxl |
| Shared Host | aws-1-ap-northeast-1.pooler.supabase.com |
| 實際使用模式／Port | Shared Supavisor Transaction / 6543 |
| 已由使用者確認的 Session Port | 5432（相同 Host；不適合本次 serverless 預讀負載） |
| Database | postgres |
| Shared username | steamfoot_ai_preview_20261125.ttworfzgwejdeolegkxl |
| Role | 無 superuser／bypass RLS／建庫／建角色權限，connection limit 8 未提高 |
| Role LOGIN 有效期 | 2026-12-02 22:15:52（台灣時間） |
| TLS | require + strict + 指紋固定的公用 Supabase CA，未關閉驗證 |

`DATABASE_URL`／`DIRECT_URL` 是不可回讀的 Sensitive，沿用原角色與密碼，未重設憑證。僅本支線的 `AI_PREVIEW_POOLER_MODE=shared-transaction-aws1` 讓後端 URL builder 先核對原 DB／完整 Vercel tuple／專用角色，再固定套用已確認 Host、6543、pgbouncer=true；不接受任意 Host 或把正式憑證改寫成測試連線。原始 DIRECT_URL 不變，所有本支線自動 migration 仍跳過。

Dedicated PgBouncer 的 `db.ttworfzgwejdeolegkxl.supabase.co:6543` 僅有 IPv6；其 username 應是裸角色。Supabase 相容性文件列 Vercel 為 IPv4-only，本機 TCP 也回 ENETUNREACH。沒有為此路徑放寬 guard 或購買 add-on。Shared 的角色格式與 Dedicated 不可混用；aws-0 不是此專案可用端點。

參考：[連線模式](https://supabase.com/docs/guides/database/connecting-to-postgres)、[IPv4／IPv6 相容性](https://supabase.com/kb/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP)。

## 支線專用設定

| Key | 狀態／用途 |
| --- | --- |
| DATABASE_URL / DIRECT_URL | Sensitive，原隔離角色憑證不變 |
| AI_IDENTITY_SECRET | Sensitive，原本支線 HMAC secret 不變 |
| OPENAI_API_KEY | 使用者親自設定的 Sensitive；只核對範圍，從未讀取值 |
| AI_VERIFIED_MODEL_CONFIG_JSON | Sensitive，有期限的費率與能力配置，最長 7 天 |
| AI_PREVIEW_POOLER_MODE | shared-transaction-aws1 |
| AI_DIGITAL_BUTLER_PREVIEW | 1 |
| AI_EXTERNAL_DELIVERY_DISABLED | 1 |
| AI_DIGITAL_BUTLER_ENABLED / AI_OPENAI_TEST_ENABLED | 1，僅提供 TEST 驗收能力；實際以 DB 總停止及店家開關封鎖 |
| BEAUTY_DATABASE_MODE / BEAUTY_NOTIFICATIONS_ENABLED | legacy / 0 |
| VERCEL_SUPPORT_LARGE_FUNCTIONS | 1，僅此支線解決 250 MB function 限制 |

精確環境守衛涵蓋 Next config、prebuild、migration runner、共用 client／URL builder 與 cached client；拒絕 Production、錯 repo／project、Cloudflare claim、正式 migration target、額外 Beauty／Addons DB secret。三個業務 client 沿用共同隔離選擇，未為 AI 引入第二套營運資料來源。

Git 自動部署對本支線為 false。建置沿用既有 Turbo，未更改全專案 Build Machine；工具沒有單次 Enhanced 選項。環境變數不會熱更新舊部署；先完成修改及檢查，確認無可重用版本才做必要建置。

## 合成資料與操作

只使用 ai-preview-steamfoot／beauty／fitness／music 四間新 isDemo 店、四個新 OWNER／Staff、合成 ShopConfig 與獨立 AI 權益。沒有複製顧客／訂單、修改真實帳號或定價。

五張 AiButler 私有表 RLS 啟用，anon／authenticated 無表權限。既有 Store／User／Staff／ShopConfig／權益讀取限合成範圍；登入稽核寫入限配對合成 OWNER 的 SUCCESS 紀錄，不能寫 Booking。知識表另有四店 RLS，營業時間及各模組公開 catalogue 只新增四店 SELECT policy，不給商業寫入。角色權限不取代應用層 store／actor／channel 驗證。

店長原入口「設定 → 通知與顧客經營 → 數位管家」只有一個。AI-only 授權可進入 AI 區塊，原確定性流程未開通時不掛載。測試只接受已驗證 session 的 TEST scope；原產業選擇器仍是合成情境；新增已發布知識測試由後端綁定真實 Store 模組及課程細分，不接受前端模組覆蓋。

知識操作沿用同頁「店家知識」：介紹／FAQ／禁止關鍵詞先存草稿再發布；引用只存開關，每次讀原營運設定。撤下保留草稿，版本衝突先核對本機文字再重新載入；限制與來源見 [知識設計](digital-butler-knowledge.md)。

後續若獲准重測：先確認角色／費率有效、版本與 DB，保持總停止到連線及權限通過；僅在隔離庫短暫開啟 TEST，先 Mock、核對額度，再最小真實請求，完成即還原總停止與四店開關。人工接手後必須明確恢復，不用重送或新 eventId 繞過；不擅自重設憑證、擴權或提高連線／預算上限。

## 緊急停止與費用結果不明

最即時方式是在**隔離 DB**設 AiButlerControl.stopped=true；新請求及晚到結果皆受控。單店可關 setting.enabled 或 HQ 權益。runtime env 關閉須由新部署載入，不能把修改變數當成已即時停用。此開關不影響原確定性數位管家與預約。

UNKNOWN 或卡住 RESERVED 不清表、不自動釋放、不用新 eventId 重試。先對照原 scope／event、ledger 與供應商用量；無法對帳時保留預留及總停止。Token／成本超出原預留時會停止全域並抑制回覆。API 全域 US$20 是應用內累計上限，不包含 Vercel／GitHub 費用，也不等於供應商硬上限。

復原優先使用停止／角色 NOLOGIN；刪除表、fixture 或正式安裝另需核對引用與獨立授權。本 Preview 連隔離 DB，**不得直接 promote 到 Production**。

## 歷史處理與後續邊界

Phase 0/1 六次部署的版本、失敗及修正保留在 [runtime 歷史](../../artifacts/ai-digital-butler/preview-runtime-20261125.json)：function 大小限制、嚴格 CA、Shared Host 辨識、Session 連線耗盡、來源選擇契約；沒有為重看同版畫面建置。平台實際費用尚未取得。

測試工具直接 HTTP 重送曾在錯誤日誌帶出短期 Cookie；已恢復停止、撤銷該 grant、使合成舊登入失效並清理本機日誌。後續改用瀏覽器同源 fetch、錯誤僅輸出摘要，重送去重通過；未讀取／輸出 OpenAI Key。

本輪另四次建置與發布時間轉型修正、短期 share URL 事件見 [知識管理驗收](digital-butler-knowledge-acceptance.md)，沒有為文件重建。知識編輯／發布與公開來源投影已驗收；通路未命中整合、客服工作台、實體對話清理，以及 Phase 3 業務工具／正式 API Project／正式 migration／試營運仍未完成。其他兩模型、真實 LINE／Messenger、實體裝置與供應商帳單核對未驗。後台指南 AI-BUTLER-PREVIEW-01 保持來源審查與待完整教學驗收，不把本次結果改寫成全站指南已驗收。
