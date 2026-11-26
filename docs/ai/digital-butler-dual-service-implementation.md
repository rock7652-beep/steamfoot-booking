# 雙服務模式共用核心：工程實作與驗收

2026-11-26（台灣時間），接續 Draft [PR #1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)。本階段完成 server-side principal／owner 抽象與品牌 adapter，並在本機 PostgreSQL 引擎演練獨立持久資料。**尚未安裝隔離／正式 schema、部署新版或開放品牌 UI／LINE 入口，不代表真實 OA 已驗收。**[前階段盤查](digital-butler-dual-service-readiness.md)保留為歷史基線。

## 實作邊界

| 項目 | 品牌客服 | 門市店長 |
| --- | --- | --- |
| principal | 嚴格 BRAND＋serviceId，不接受 storeId、module、customerId | 保留 TrustedAiScope、Store、四產業模組 |
| 身分／重送 | HMAC 加入版本及 BRAND namespace，OA／actor／event 皆隔離 | 舊 scopeKey／eventKey 演算法不變，不重新計費舊事件 |
| 授權／設定 | AiBrandGrant，Hidden／Locked／Enabled 及生效期限；獨立啟用與額度 | 原 StoreFeatureEntitlement、角色及會員驗證邊界 |
| 知識 | BRAND scope＋serviceId；手動核准產品介紹／FAQ | 原 STORE／MODULE／SYSTEM 及權威營運來源 |
| 營運工具 | adapter 不提供工具；偽裝含 Store 欄位亦遭 registry 拒絕；拒絕 hours／services／prices 營運引用 | 原有 READ_ONLY 工具及身分核對，未開放 WRITE |
| 對話／人工 | AiBrandConversation／Dispatch／HandoffAudit | 原 AiButler 表及 UI 契約 |
| 預算 | 獨立帳本、日／月額度，UNKNOWN 保留預留費用 | 舊額度不提高、不重置 |

共用 `AiServiceCore`、`AiRoutingCore`、OpenAI Responses Provider、來源選擇與原文 renderer，以及 owner repository 的 reserve／settle／unknown、去重、人工接手／稽核恢復和知識版本操作。Store facade 保留既有公開方法；沒有複製第二套 Service、Provider、狀態機或工作台。

儲存使用封閉的程式端表名映射；外部輸入不能提供表名／schema。品牌資料無 Store 外鍵，也不借用任何門市記錄。新 SQL 只存於 `scripts/sql/ai-digital-butler/brand-owner-schema.draft.sql`，不在 Prisma／CI migration／自動部署安裝路徑，預設沒有服務 seed、開關啟用、server-role grants 或 RLS 開放 policy。

全域仍使用同一 `AiButlerControl` 鎖、總預算及同時請求上限；兩份帳本均存在時合計全域用量，服務本身日／月限制只計自己的 owner。Store 在品牌 schema 未安裝時沿用既有帳本；已安裝的另一帳本無法讀取時直接拒絕，不能忽略費用。品牌缺表／缺資格時不回退 Store。

## 安全及操作契約

- Brand adapter 預設停止，僅 TEST；沒有 sender、公開 route、Webhook 改址、token／secret 讀取或新的環境設定。授權函式為必要 server port；呼叫前、模型等待後與 Routing 完成前均核對。主體資料在任何 await 前複製並凍結，防止途中被改成另一品牌。
- 操作員權限與聊天使用者分開，知識讀寫、設定讀寫、人工清單及恢復均需明確操作授權。恢復重用同一修訂／未解決事件檢查與 audit，不能靠換 adapter、模型或時間自動解除。
- 品牌知識嚴格 schema，不能塞入 SYSTEM；Store selector 也拒絕品牌欄位。發布／撤回、來源到期、版本或禁止事項變動後重新核對，不能送出舊答案。
- 設定、知識草稿與人工清單沿用既有 contract，可供現有 Settings／knowledge editor／handoff 元件使用；**本輪不新增或改動 UI，不掛上品牌頁面**。HQ 狀態語意沿用[既有 Framework](../hq-feature-three-state.md)；Store 的 entitlement 規則未改寫為品牌規則。
- 沒有 UI 變更，因此沒有新的桌機／iPad／手機畫面驗收或 Preview；既有六尺寸紀錄只證明當時已部署版本，不能用來宣稱新版品牌入口可操作。Cloudflare 與本輪純後端變更無依賴。

## 本機驗證

測試檔 `src/__tests__/ai-digital-butler-dual-service.test.ts` 在 PGlite 真正執行 SQL 與交易，使用合成品牌、合成 Store 和 fake transport，不使用遠端資料庫或真實憑證：

- 不存在任何 Store 時，品牌完成知識發布、來源選擇、回答與獨立用量紀錄。
- 同字串的 Store／品牌 ID、同 OA／使用者／event 仍不同 namespace；舊 Store HMAC 完全相容；跨品牌與混合身分遭拒。
- 品牌知識不流入另一品牌、門市或 SYSTEM；Store 營運引用及工具拒絕；發布衝突、撤回與等待中變更遭保護。
- HQ Hidden／Locked、授權到期／尚未生效、單一服務關閉、日額度、月預算、跨模式總額度及同時請求上限。
- 緊急停止、授權撤銷、人工接手發生在 await 期間，無法送出原 AI 答案；用量超限觸發共用總停止。
- 既有流程優先、Routing／模型事件去重、UNKNOWN 不重試／不釋放預留費用、重新建立 adapter 後仍靜默、未解決事件禁止恢復、有稽核的重送恢復。
- 真正 OpenAI Responses parser／計費使用本機 fake transport 演練；全域 fetch 被測試守門禁止。**本輪真實 API 0 次、外發 0 次，新增真實 API 費用 US$0。**
- 八張品牌表 RLS 開啟，anon 無讀取權；品牌外鍵只到 AiBrandService；缺表無 Store fallback，已安裝 peer ledger 權限不足時拒絕預留。

AI／LINE 回歸、型別與變更檔 lint 的結果記錄於[本輪摘要](../../artifacts/ai-digital-butler/dual-service-core/summary.json)。完整 CI 的精確 head SHA、run 及測試數以原 PR 最新驗收紀錄／checks 為準；不將本機演練標示為雲端安裝或 OA 平台驗收。

## 另需授權的最小後續範圍（本輪未執行）

若進入隔離環境的品牌操作驗收，只需先審核上述八張私有品牌表、指定隔離服務 ID、獨立操作員授權及 server-role 最小 ACL／RLS；同時確認該角色可以完整讀取兩份私有成本帳本所需的全域合計，不授予門市會員／營運工具權限。安裝限定隔離庫 `ttworfzgwejdeolegkxl`，總停止維持 true、四店與品牌均關閉，保留原上限；不修改 Production。**此段不是安裝指令，也沒有視為已取得授權。**

之後才可將品牌 owner 掛到既有 Settings／知識／人工操作入口並驗證 RWD；真實 LINE OA 接入、測試白名單、改址、憑證或外發須各自提出精確範圍。不能把本輪 backend adapter 當成上述操作已完成。
