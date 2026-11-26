# 品牌 AI 客服與暖暖 AI 店長：雙模式架構與既有 OA 驗收盤查

2026-11-26（台灣時間），沿用 Draft [PR #1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)。本文件為目前產品方向：A 使用蒸管家品牌 OA、獨立於門市營運；B 使用暖暖 OA、連結本店營運。兩者共用核心，各自授權、開關與資料隔離。本輪只有唯讀盤查與本機測試準備，沒有實作或啟用正式分流。

**結論：核心演算法可共用，但目前並未完整支援無門市的 A 模式；現有 OA 也不能只靠 Preview 白名單就完成真實收發。**不能將 A 假掛暖暖 storeId、把它當第五個產業模組，或複製另一套 AI Framework。獨立測試 OA 改為無法安全使用既有 OA 時的替代方案，不是本輪先決條件。

[本機證據](../../artifacts/ai-digital-butler/dual-service-readiness/summary.json)／[OA 對照的唯讀中繼資料](../../artifacts/ai-digital-butler/dual-service-readiness/oa-store-metadata.json)／[LINE 官方 API 定義](../../artifacts/ai-digital-butler/dual-service-readiness/line-platform-reference.json)。原已完成的 [零外發 HTTP 驗收](digital-butler-line-webhook-acceptance.md)仍有效；[獨立測試 OA 預檢](digital-butler-line-platform-preparation.md)保留為先前 Store-only 的備選，不代表 A 已支援。

## 兩種模式的邊界

| 項目 | A：獨立 AI 智慧客服 | B：AI 數位店長 |
| --- | --- | --- |
| OA | 蒸管家品牌 OA | 暖暖蒸足 OA |
| 所有者 | 品牌服務帳戶，例如 service:steamfoot；不要求 Store、ShopConfig 或 IndustryModule | 後端核對的暖暖門市；實際營運讀取需另取得範圍授權 |
| 內容 | 已核准的產品介紹、產品方案價格、功能、可公開操作指南及試用入口 | 本店已發布知識；已開通且已驗證身分的本店唯讀工具 |
| 價格來源 | 官網產品方案，如 public-pricing-offer.ts；促銷有效性及版本由權威來源決定 | 暖暖銷售給顧客的服務／方案；不得當成蒸管家 SaaS 價格 |
| 會員／營運資料 | 不讀任何門市會員、預約、錢包或堂數 | LINE Provider／門市／canonical member 每次核對，Guest 不自動取得會員權益 |
| 試用／體驗 | 可引導既有公開申請入口；本輪不替使用者提交申請、寫 Lead 或發通知 | 未來按原服務契約辦理體驗；本輪不開發預約、取消或改期寫入 |
| 人工 | 品牌服務自己的對話、接手與恢復紀錄 | 暖暖本店自己的對話、接手與恢復紀錄 |
| 授權／開關 | 品牌服務授權與服務開關；沿用 HQ Hidden／Locked／Enabled 呈現規則 | 原店家資格、角色權限及門市開關 |
| 預算 | 獨立服務額度及成本帳本 | 獨立門市額度及成本帳本；原上限不提高／重置 |

共用全域緊急停止可作最外層保護；單獨關閉 A 不應停用 B，反之亦然。Provider、格式驗證、來源白名單、成本計算、去重及人工狀態機共用，不能因此共用會員權限、知識所有者或對話身分。

## 現有程式可共用與必須調整的部分

| 現況與來源 | 判定 |
| --- | --- |
| ai/provider.ts：Responses、輸入／用量限制、費率驗證與 source-id 回應格式 | 可共用同一 Provider；目前 instructions 以店家敘述，之後以受控服務 context 參數化，不另寫一個 Provider |
| ai/knowledge.ts：已發布／有效期篩選、核准文字 renderer、非法來源轉人工 | 演算法可共用；需由各 owner adapter 先投影正確來源 |
| ai/service.ts 的 TrustedAiScope、aiIdentity 要求非空 storeId；AiModule 只列四產業 | A 目前會被拒絕。service mode 應是另一個維度，不是產業；不能拿暖暖或假 Store 作品牌帳戶 |
| ai/repository.ts 的 Store FK、StoreFeatureEntitlement、setting／budget 及 knowledge-document 以 storeId 綁定 | A 仍依賴門市。建議將 owner/principal 與身分編碼、權限、儲存介面抽為共用 port；品牌 service adapter 與門市 adapter 各實作所需邊界，避免複製整個 Service／Routing |
| SYSTEM 知識目前會給所有符合條件的門市 | 品牌產品知識不能一律放 SYSTEM。SYSTEM 只留真正共用安全內容；品牌／門市知識需各 owner 的來源投影與命名空間 |
| aiIdentity 目前包含 store/channel/OA/actor，不包含 module | 不同 OA 已分開對話，但換 module 不會創造獨立產品授權／預算。需獨立 owner＋mode namespace，且不得藉改 namespace 重跑同一平台事件 |
| AiToolRegistry 的 KNOWLEDGE 拒絕所有營運工具，READ_ONLY 才能調已核准 READ adapter | 可沿用。A 固定知識模式、無營運工具；B 先沿用空位／本人預約等已驗唯讀契約，WRITE 本輪仍不開發 |
| 現有後台 knowledge editor、Settings 骨架、待人工清單與 revision/audit | 後續用 owner adapter 共用操作元件；A 可放 HQ 服務設定，不另建一套營運後台／客服工作台。Enabled 不等於可跨 owner 讀資料 |

以上為設計建議，沒有建立新表、改 enum、安裝 policy 或遷移既有事件。需要 schema／授權變更時，另提出具體 diff 與測試後才執行。

## 兩個既有 OA 的唯讀結果

- 品牌路徑：原 `/api/line/webhook` 先驗蒸管家品牌 secret，交 `handleSteamButlerEvent`；目前只有「找到適合方案」的確定性回覆，不是新 AI。讀到 source code 不能代表實際 LINE callback 已核實，也不能取代 LINE 管理介面的帳號設定。
- 暖暖對照：正式 steamfoot 專案以 `BEGIN READ ONLY` 只讀 Store 的公開識別配置，確認 canonical id `e182e256-98ca-4c78-970b-d4b118066c51`、slug zhubei、name 暖暖蒸足、STEAMFOOT、非 Demo、已有 destination。只保存 destination 指紋，未讀顧客、會員、交易或憑證；沒有正式寫入。不能沿用 seed 的 default-store 當正式 ID。
- 隔離庫沒有暖暖的這個正式對照；四合成門市的 destination 仍空。之後 B 的隔離測試只能映射到明確合成門市／資料，不能讓 Preview 改連正式庫。
- Vercel metadata 顯示既有品牌與門市 key 可在 Preview 出現；未解密，未呼叫 OA info、未確認 token 有效性、實際 Provider／Messaging channel／LINE callback URL。既有設定記錄不是使用正式 OA 憑證的執行授權。
- 原非 Preview handler 仍品牌分支／門市分支，各自執行既有服務；本 repo 未見已啟用、可將白名單測試事件送到隔離 AI 的正式 dispatcher。是否另有外部整合仍未由 LINE 平台核實。

## 為何「只加白名單」不足以完成真收發

LINE 官方 API 的 webhook endpoint 是該 Messaging channel 的一個 endpoint 設定。若正式 callback 不變、正式入口又沒有測試分流，真實使用者事件仍到原服務，不會因 Preview 有白名單就自動到 Preview。修改既有 OA 的 callback 會影響該 OA 所有使用者，不能視為只改測試人員。

未來若要沿用兩個既有 OA，**優先方案是正式入口的窄範圍 dispatcher**，保留 OA callback URL，且須另取得正式程式變更／發送授權。目前不安裝、不部署、不開啟：

1. 先以原始 bytes 驗實際 OA 簽章並核對 destination，才看伺服器控制的 `(mode, OA, test UID hash)` 白名單、期限及各模式開關；不是 LINE Login 的 tester 名單，也不是訊息文字／前端傳入的 storeId。
2. 未列名者、非測試事件、過期或未開啟狀態，完整沿用原 owner／原服務，不送到隔離系統，也不經 AI；不能增加一般顧客的等待或改動原流程結果。
3. 白名單只圈定測試人員，不授會員權益。測試 B 綁定合成資料；A 無門市資料讀取。單一 OA／mode 的測試權限不連帶授權另一 OA。
4. 一個批次可能混有測試與一般顧客。不能全量轉送原始 body 到 Preview；原入口驗簽後，只傳測試事件的最小 relay envelope。拆分 body 後不能假裝原 LINE HMAC 還有效；需明確、body-bound 的 relay 證明及期限／重播檢查，必要憑證另授權。Vercel OIDC／Trusted Sources 可評估為通道身分，不能未經驗證就取代應用層 envelope 完整性。
5. 每個平台實體事件只選一次 reply owner；既有回覆與測試 sender 不可競用同一 replyToken。重送沿用原 event/message 與已記錄 owner，切 mode、Provider 或停啟後不能重跑舊 sink。逾時／不明結果保留 UNKNOWN，不自動轉原流程補送造成雙重回覆。
6. 發送前再次核對 mode／OA／測試使用者／期限／來源／人工 revision／停止／預算。獨立上限不超過既有總上限；緊急停止優先。真正送達及費用要有實際 API 回執，不以 sink 狀態代替。

這需要正式入口有受控程式能力，與「不改正式 callback」是兩個不同授權範圍。現況同時維持不改正式程式及不開外發時，不能宣稱可完成既有 OA 的測試人員收發驗收。

## 不改正式服務的分階段驗證與替代方案

| 方案 | 能證明的範圍 | 目前限制／必要授權 |
| --- | --- | --- |
| 本輪本機 shadow harness | 真實 HMAC 演算法、OA／mode 對應、白名單外保留 original owner、獨立開關與資料邊界；完全零外發 | 只在測試檔，沒有正式分流能力，不算 LINE 平台收發 |
| LINE 官方 Test Webhook Endpoint API，明確指定測試 endpoint | 官方定義將 test 與 set endpoint 分開，可作為不修改已設 callback 的連線驗證候選 | 本輪未呼叫，需另批准憑證使用與測試入口可達性；通常是空 events，不能驗測試使用者回覆、人工或會員流程，不算完整 E2E |
| 獨立測試 OA，使用同一 Framework 的 A/B 隔離 owner fixtures | 真實 LINE 平台收發與受控 sender；不讓現有 OA 的顧客經過 Preview | 建立帳號／憑證／設定 callback／外發各需批准；不是新產品模式，也不能當已驗兩個正式 OA。可先評估單 OA 配明確測試 user→owner 映射，避免不必要帳號；不得靠訊息猜店 |
| 兩既有 OA＋正式窄範圍 dispatcher | 最終可驗真實既有入口與白名單收發，保留一般顧客原服務 | 正式入口程式、relay 信任、憑證、短效外發窗口需另批准；目前僅評估，不能執行 |

不採「短暫把整個既有 OA Webhook 改到 Preview」、「全量鏡像顧客訊息」、「直接用正式 Customer 作隔離測試」或「複製訊息後宣稱平台 E2E」。也不為方便解封整個共享專案或沿用已撤銷的分享連結。

## 本輪實際測試與安全狀態

新增 `ai-dual-service-readiness.test.ts`，使用現有真實 HMAC、aiIdentity／Service、Provider request builder、已發布來源 renderer、價格來源及 ToolRegistry；shadow 分流僅在測試檔，所有 canSend=false、originalMustRemainOwner=true。包括非白名單、兩 OA 同人、關閉其中一模式、總停止、跨 OA 簽章、偽造 mode／store、品牌無 Store 被目前 Service 阻擋、SYSTEM 知識跨店特性、Provider／renderer 可重用、知識模式不可叫營運工具。

本機 5 檔／116 項通過，與前輪準備 5 檔／121 項重疊，不相加；ESLint／型別通過。原品牌 Webhook 與核心／工具權限一併回歸。沒有實際 LINE／OpenAI 呼叫、OA／憑證建立、正式 Webhook／dispatcher／DB policy 修改、部署、外發或預約寫入。正式只讀門市識別配置，不讀顧客／會員／交易；隔離庫仍總停止、四店關閉、53 requests／5 OpenAI／113 Dispatch、未決 0，維持 Draft，不合併。

目前不需要使用者改任何設定。若後續選定真收發路徑，工程端先完成所選方案的具體程式／測試與回復設計，再分別取得正式入口、憑證或外發的明確授權；此盤查不延伸既有授權。

參考：[LINE 官方 OpenAPI](https://github.com/line/line-openapi/blob/main/messaging-api.yml)、[取得 webhook endpoint](https://developers.line.biz/en/reference/messaging-api/#get-webhook-endpoint-information)、[測試 endpoint](https://developers.line.biz/en/reference/messaging-api/#test-webhook-endpoint)、[Vercel 自動代理存取](https://vercel.com/docs/deployment-protection/automated-agent-access)、[既有 HQ 三態](../hq-feature-three-state.md)。官方 API 定義已讀取，實際 LINE 控制台與兩 OA callback 尚未用憑證核對。
