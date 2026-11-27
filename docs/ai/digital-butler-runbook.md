# AI 數位店長隔離 Preview Runbook

目前核心、Phase 2 店家知識管理、原流程 → AI → 真人的 Mock 串接、待人工處理管理、蒸足空位及本人預約唯讀工具已完成合成 TEST 驗收；正式客服未開放。架構與安全契約以 [工程契約](digital-butler-core.md) 為準，最新 LINE HTTP 零外發結果見 [Webhook 驗收](digital-butler-line-webhook-acceptance.md)；合成 LINE 主流程與真實 API 結果見 [端到端驗收](digital-butler-line-e2e-acceptance.md)，其中額外 QA 登出 probe 的空值判讀錯誤另有診斷；互動修正及計時定義見 [會員入口效能盤查](digital-butler-member-performance.md)；功能實測見 [本人預約唯讀驗收](digital-butler-member-bookings-acceptance.md)，[蒸足空位驗收](digital-butler-availability-acceptance.md) 保留當時結果，[待人工處理驗收](digital-butler-handoff-acceptance.md) 保留當時結果，[Mock 串接驗收](digital-butler-routing-acceptance.md) 保留當時結果，[知識管理驗收](digital-butler-knowledge-acceptance.md) 保留當時結果；[Phase 0/1 歷史](digital-butler-acceptance.md) 保留。

## 已驗證版本與目前狀態

- PR [#1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)，支線 `feat/ai-digital-butler-core`。
- 程式／Preview SHA：`005ce6e61562a1e5694b7537fbcbdb5d04eab5da`；後續文件／證據及測試時限提交以 PR head 為準，不另建相同程式 Preview。
- [受保護 Preview](https://steamfoot-booking-26jkkka2o-rock7652-2111s-projects.vercel.app)，deployment `dpl_8XMZsnsSwHjMs9cFRRSqSYbm2Nn1`，READY。
- 2026-11-26（台灣時間）完成核心與知識管理的隔離登入、發布／撤下、來源引用、Mock、最小真實 API、帳本與 RWD 驗收。
- 收尾狀態：**global stopped=true、四店 enabled=false**，53 筆請求全部 COMPLETE，RESERVED／UNKNOWN 0；48 筆 Mock、5 筆 OpenAI，累計保守估算 US$0.002690。累計估算不是供應商帳單；早期串接新增 7 Mock；人工接手管理本身不呼叫模型；最新合成 LINE 演練新增 2 筆真實 API／2 筆 Mock，累計 113 筆 Dispatch 全部 COMPLETE、12 筆恢復 audit。原先 1 筆合成接手旗標保留。
- 最新 HTTP 驗收第一條與替代 30 分鐘通行連結均經分別批准，已全部撤銷，回應顯示 shareable-link 0；合成美業 OWNER 臨時密碼已清除、修正後登出 probe 雲端通過，私密設定與瀏覽器已清理；SSO 保留。
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

只使用 ai-preview-steamfoot／beauty／fitness／music 四間 isDemo 店、四個新 OWNER／Staff、合成 ShopConfig 與獨立 AI 權益。沒有複製顧客／訂單、修改真實帳號或定價。

七張 AiButler 私有表（新增操作 audit） RLS 啟用，anon／authenticated 無表權限。既有 Store／User／Staff／ShopConfig／權益讀取限合成範圍；登入稽核寫入限配對合成 OWNER 的 SUCCESS 紀錄，不能寫 Booking。知識表另有四店 RLS，營業時間及各模組公開 catalogue 只新增四店 SELECT policy，不給商業寫入。角色權限不取代應用層 store／actor／channel 驗證。

隔離蒸足另有 Booking／DutyAssignment 的 ai_preview_availability_read，僅 SELECT 且只限該合成店；不授 INSERT／UPDATE／DELETE，避免 RLS 缺讀政策把占用人數視為零。SQL 與回復方式見 [唯讀契約](digital-butler-availability.md)。

店長原入口「設定 → 通知與顧客經營 → 數位管家」只有一個。AI-only 授權可進入 AI 區塊，原確定性流程未開通時不掛載。測試只接受已驗證 session 的 TEST scope；原產業選擇器仍是合成情境；新增已發布知識測試由後端綁定真實 Store 模組及課程細分，不接受前端模組覆蓋。

知識操作沿用同頁「店家知識」：介紹／FAQ／禁止關鍵詞先存草稿再發布；引用只存開關，每次讀原營運設定。撤下保留草稿，版本衝突先核對本機文字再重新載入；限制與來源見 [知識設計](digital-butler-knowledge.md)。

後續若獲准重測：先確認角色／費率有效、版本與 DB，保持總停止到連線及權限通過；僅在隔離庫短暫開啟 TEST，先 Mock、核對額度，再最小真實請求，完成即還原總停止與四店開關。人工接手後必須明確恢復，不用重送或新 eventId 繞過；不擅自重設憑證、擴權或提高連線／預算上限。

合成蒸足同頁「即時空位查詢」人工查單日空位，沿用顧客預約窗、截止、值班及占用規則；總停止時可做唯讀驗收，不啟動模型或預約。其他三產業 adapter 尚未開放。

同頁「AI 待人工處理」直接列出本店合成對話的持久接手狀態，經準備／確認後恢復，私有 audit 與版本更新同一交易。不明結果重試同一 commandId；版本衝突需重新核對；仍有 RESERVED／UNKNOWN／CLAIMED 事件時不允許恢復。局部刷新使用共用 reader 並重查帳號／門市；不重跑整個課表頁、不建立虛構原客服名單。見 [功能契約](digital-butler-handoff.md)。

同頁「原流程與 AI 串接」只用固定合成情境與 Mock。先驗原流程／等待輸入，再在已核對額度下驗已知來源與未知轉真人；真人接手持久保留，需明確恢復。同一未確認事件沿用 eventId，不以換情境或新事件重跑。安裝本輪增量 DDL 只用 `scripts/sql/ai-digital-butler/preview-routing.sql`，不可當成正式 migration。

另有 [LINE 格式離線合成驗收](digital-butler-line-synthetic-acceptance.md)，使用既有簽章函式、公開 fixture secret、TEST scope 及本機 PGlite，不需要打開 Preview／四店開關，也不接正式 Webhook。測試 driver 僅位於 `src/__tests__`，不能當成已部署通路介接。

## 緊急停止與費用結果不明

最即時方式是在**隔離 DB**設 AiButlerControl.stopped=true；新請求及晚到結果皆受控。單店可關 setting.enabled 或 HQ 權益。runtime env 關閉須由新部署載入，不能把修改變數當成已即時停用。此開關不影響原確定性數位管家與預約。

UNKNOWN 或卡住 RESERVED 不清表、不自動釋放、不用新 eventId 重試。先對照原 scope／event、ledger 與供應商用量；無法對帳時保留預留及總停止。Token／成本超出原預留時會停止全域並抑制回覆。API 全域 US$20 是應用內累計上限，不包含 Vercel／GitHub 費用，也不等於供應商硬上限。

復原優先使用停止／角色 NOLOGIN；刪除表、fixture 或正式安裝另需核對引用與獨立授權。本 Preview 連隔離 DB，**不得直接 promote 到 Production**。

## 歷史處理與後續邊界

Phase 0/1 六次部署的版本、失敗及修正保留在 [runtime 歷史](../../artifacts/ai-digital-butler/preview-runtime-20261125.json)：function 大小限制、嚴格 CA、Shared Host 辨識、Session 連線耗盡、來源選擇契約；沒有為重看同版畫面建置。平台實際費用尚未取得。

測試工具直接 HTTP 重送曾在錯誤日誌帶出短期 Cookie；已恢復停止、撤銷該 grant、使合成舊登入失效並清理本機日誌。後續改用瀏覽器同源 fetch、錯誤僅輸出摘要，重送去重通過；未讀取／輸出 OpenAI Key。

前一知識階段四次建置與發布時間轉型修正、短期 share URL 事件見 [知識管理驗收](digital-butler-knowledge-acceptance.md)，沒有為文件重建。本輪另兩次必要 Preview 建置完成 [合成 Mock 串接](digital-butler-routing-acceptance.md)，包含 Dispatch 認領、UNKNOWN 阻擋及真人操作世代，未改環境或 API 限額。知識編輯／發布、公開來源投影與合成原流程未命中串接已驗收；真實通路未命中整合、客服工作台、實體對話清理，以及 Phase 3 業務工具／正式 API Project／正式 migration／試營運仍未完成。其他兩模型、真實 LINE／Messenger、實體裝置與供應商帳單核對未驗。後台指南 AI-BUTLER-PREVIEW-01 保持來源審查與待完整教學驗收，不把本次結果改寫成全站指南已驗收。

## 本人預約唯讀增量（2026-11-26 台灣時間）

合成蒸足會員沿用「我的預約」入口，人工單日查詢本人預約，每頁 25 筆；只接受日期／頁碼，店家與已確認會員由後端 session 取得。Owner 不能代查。與知識 Provider、自動模型及正式通路保持隔離，詳見 [契約](digital-butler-member-bookings.md) 與 [最新驗收](digital-butler-member-bookings-acceptance.md)。

隔離庫保留三個合成 CUSTOMER／Customer、兩筆合成蒸足 Booking；外店只有身分對照，沒有跨模組 Booking。新增三條精確 fixture ID 的 SELECT policy，不給商業寫入權限；共用角色的 RLS 不能取代每次讀取的本人授權。三個帳號收尾 SUSPENDED、passwordHash NULL，原合成 Owner 更新登入版本，手動 grant 撤銷、私密暫存檔刪除。新工具拒絕停用後的舊 CUSTOMER session，不宣稱所有既有會員 JWT 全域失效。

全量 CI 17,637 passed／340 skipped；雲端 17 項與六尺寸通過。模型帳本仍 47／Dispatch 65／audit 8，global stopped=true、四店 enabled=false。此輪一次必要 Preview，文件提交沿用同一程式 Preview；實際平台帳單未取得。

會員入口已完成 [分段效能盤查](digital-butler-member-performance.md)：原 entryMs 包含登入與測試工具等待，不能當單頁耗時；修正版先等待客戶端可互動才啟用展開，九次進頁首次有效點擊均成功。會員頁可操作中位數約 1.7 秒，含登入至首次查詢結果中位數約 8.1 秒，仍有等待；不宣稱資料庫加速或真機／Production 速度。此輪帳本不變，兩個 30 分鐘手動 grant 均已撤銷，合成 A 已停用且密碼清除。

## 真實模型與合成 LINE 主流程（2026-11-26 台灣時間）

[契約](digital-butler-line-e2e.md) 與 [驗收／QA 診斷](digital-butler-line-e2e-acceptance.md) 記錄同次 signed fixture → 原流程 → 已發布知識 → 真實 Responses → 人工接手／確認恢復。合成美業的已知回答與未知轉接兩筆 API 均 COMPLETE，1,324 input／56 output tokens，新增保守估算 US$0.001380，非實際帳單。重送與接手靜默不新增模型請求。

13 個必要情境與六尺寸通過；額外登出 probe 對 null session 的存取錯誤保留，helper 已離線修正、未增加連結或 API 重跑。收尾 stopped=true、四店關閉，額度未提高／重置；美業當日 13／20，蒸足仍不重測。真實 OA／Webhook、實際傳送、正式顧客與預約寫入仍未開放。

## LINE HTTP 接入（零外發）

新版接入與安全契約見 [LINE Webhook](digital-butler-line-webhook.md)。HTTP 固定 Mock、回覆只記 OUTBOUND_BLOCKED，沒有修改 TEST 開關、額度或真實外發；不沿用前輪一次性連結授權。實際 CI／部署／雲端證據依該階段補記，不將本機 fixture 當正式 OA 驗收。

實測已完成：[14 項雲端驗收](digital-butler-line-webhook-acceptance.md)，新增兩筆 Mock、真實 OpenAI 0、全部回覆只記阻擋 sink；美業當日 15／20。QA 登出修正版雲端通過，原失敗保留；總停止／四店關閉、密碼清除及兩條短效連結撤銷均已核對。不代表真實 OA 或外發已驗。

## 獨立測試 OA 準備（仍停止）

[唯讀盤查與離線預檢](digital-butler-line-platform-preparation.md)記錄下一輪真實 LINE 平台收發的阻擋與授權順序。新增工具不連線、不啟用 sender，沒有 runtime 或環境設定修改；尚未選定專用測試 OA、開通平台入口或核對其憑證。原停止、四店關閉、外發封鎖與已驗 Preview 均保留。

## 雙服務模式：目前主方向

[品牌 AI 智慧客服／暖暖 AI 店長盤查](digital-butler-dual-service-readiness.md)是最新產品方向；獨立測試 OA 只保留為備案。核心可共用但品牌 owner 尚未脫離 storeId，現有 OA 白名單沒有正式分流就不能直接到 Preview。僅新增本機 shadow／既有核心邊界測試，沒有正式 dispatcher、OA callback、憑證、外發或資料政策變更。後續真實收發需選定方案並另取得具體授權。


## 雙模式核心實作（尚未部署）

[工程驗收與授權界線](digital-butler-dual-service-implementation.md)記錄本輪共用 Service／Routing／owner 儲存狀態機及獨立品牌 adapter。本機演練不需建立 Store；品牌知識不進 SYSTEM，品牌不能取得營運工具。遠端 schema、品牌操作入口與真實 OA 仍未啟用；舊 Preview 不含本輪程式，不沿用先前短效連結授權。AI 總停止、四店關閉、外發封鎖與 Production 均未變更。


## 品牌 Preview 前置審查（未安裝）

[唯讀核對、最小 ACL／RLS、安裝與回復提案](digital-butler-brand-preview-review.md)記錄隔離庫品牌物件缺漏、實際 default ACL 與 11 項本機安裝／回復演練。僅 prepared SQL，未獲准或執行遠端安裝／seed；總停止／四店關閉／外發封鎖不變。原 PR 保存具體批准範圍；Cloudflare Workers Builds 另列獨立待查。
