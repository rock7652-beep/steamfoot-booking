# 蒸管家數位管家模板系統架構規格（PR-0）

> 狀態：架構規格（不含實作）
> 範圍：PR-1 至 PR-6 的共同契約
> 本文件不建立資料表、migration、webhook 或環境變數變更。

## 1. 產品定位與目標

正式名稱為「**蒸管家數位管家模板系統**」（Digital Butler Template System）。

第一階段的目標是讓不懂程式的店長，能在 10 分鐘內以模板建立、預覽並啟用一套屬於自己店家的 LINE 自動互動流程。系統以可設定的流程引擎執行，不為個別場景寫死專用邏輯。

長期而言，數位管家是蒸管家的自動化核心：不同的顧客經營能力應能以可安裝的數位管家模板交付，而非每次重新開發一套訊息流程。

## 2. MVP 範圍與非目標

### 支援

- 每店獨立的流程、名單與執行紀錄。
- 關鍵字觸發、開場訊息、自由文字題、單選題（Quick Reply）、台灣手機號碼題與完成訊息。
- 題目新增、刪除、排序；草稿、預覽、發布、暫停與封存；複製流程。
- 依答案建立 Lead 名單。
- 官方「真人諮詢管家」模板。
- 總部 entitlement、店家總開關、單一流程發布／啟用三層控制。

### 明確不支援

- 條件分支、等待／排程、AI 生成或最佳化建議、管家人格、自由流程畫布。
- Email、SMS、App Push、外部 API 動作。
- 第三方模板販售、Marketplace、模板分潤與自動差異合併。
- Lead 自動轉換 Customer；第一版 Lead 不寫入既有 `Customer`。

## 3. 角色、權限與資料範圍

現有系統角色為 `OWNER`、`MANAGER`、`CUSTOMER`；「總部」是跨店營運權限集合，不應僅以前端角色名稱判斷。後續實作須將下列能力落到既有 `checkPermission()`／`requirePermission()` 與可稽核的 permission code，且所有 dashboard 頁面包含 new/edit 子頁均在頁首做 UI 檢查。

| 使用者 | 能力 | 資料範圍 |
| --- | --- | --- |
| 總部 | 建立與發布官方模板、管理 entitlement、查看授權店家、依授權跨店查看 Lead | 受其跨店權限限制；預設無跨店 fallback |
| 店長（Owner） | 安裝官方模板、修改店家副本、建立自訂流程、預覽／發布／暫停、查看店內 Lead 與紀錄 | 僅自己的 `storeId` |
| 店員（Manager） | 預設只讀店內 Lead；是否可編輯流程由新增的流程權限決定 | 僅自己的 `storeId`；不得修改 entitlement |
| 顧客 | 無後台流程或 Lead 管理權 | 僅參與自己的 LINE 對話 |

店員流程編輯權預設為關閉。未來加入的權限碼建議按 `digitalButler.*` 命名（例如 `digitalButler.read`、`digitalButler.manage`、`digitalButler.lead.read`），但 PR-0 不變更現有權限碼或 schema。

## 4. 三層開關

新對話只有在下列順序全部通過時才可啟動：

```text
店家有總部 entitlement？
        ↓ 是
店家數位管家總開關為開啟？
        ↓ 是
流程為 PUBLISHED 且啟用？
        ↓ 是
觸發條件命中且非系統保留指令？
        ↓ 是
建立 conversation 並執行流程
```

| 層級 | 擁有者 | 關閉效果 |
| --- | --- | --- |
| 總部 entitlement | 總部 | 該店不可安裝／發布或開始新的數位管家流程 |
| 店家總開關 | 店長（在 entitlement 允許時） | 停止該店所有新數位管家對話 |
| 單一流程狀態 | 可管理流程者 | 僅影響該流程的新觸發 |

任一層關閉時，**只停止數位管家新流程**；不得影響預約提醒、改約／取消通知、方案通知、LINE 綁定、店家原有訊息或顧客預約頁。已開始的對話依第 10 節規則可完成。

## 5. 核心領域模型

以下是概念模型，不是 Prisma schema：

| 實體 | 責任與必要識別 |
| --- | --- |
| `DigitalButlerTemplate` | 總部官方、可安裝的模板；含穩定 template identity、版本與內容 |
| `StoreDigitalButlerFlow` | 店家私有流程副本；必帶 `storeId`、來源 template／版本（如有）與目前發布指標 |
| `DigitalButlerStep` | 流程版本中的有序步驟；含型別、顯示內容、驗證、答案欄位與下一步 |
| `DigitalButlerConversation` | 一次顧客互動；必帶 `storeId`、`flowId`、`flowVersionId`／快照、channel identity 與 `lineUserId` |
| `DigitalButlerAnswer` | 屬於 conversation 的單一步驟答案；以 step snapshot key 關聯而非可變草稿 |
| `DigitalButlerLead` | 流程完成後建立的獨立名單，連結 store、flow、conversation 與答案快照 |
| `DigitalButlerExecutionLog` | 安全、可追蹤的執行／失敗／去重紀錄；不得包含原始個資或 secrets |

關係如下：

```text
DigitalButlerTemplate（官方 vN）
              │ 安裝／複製
              ▼
StoreDigitalButlerFlow（單一 storeId 的私有副本）
              │ 發布為不可變版本快照
              ▼
DigitalButlerConversation ──► DigitalButlerAnswer
              │ 完成且具冪等鍵
              ▼
DigitalButlerLead
```

官方模板與店家副本必須分離。店家流程永遠屬於單一 `storeId`；不得只憑 flow 或 template ID 查詢，也不得使用預設店家。`lineUserId` 非全域對話主鍵，conversation 的有效身份為 `(storeId, channelIdentity, lineUserId)`。

## 6. 模板、副本與版本

1. 總部發行官方模板 `v1`。
2. 店家安裝時，建立自己的 flow 副本，並記錄 `sourceTemplateId` 與 `sourceTemplateVersion`。
3. 店家可修改副本；其草稿與發布版本由店家獨立擁有。
4. 官方發行 `v2` 時，店家顯示「有新版」；不自動覆蓋或合併店家副本。
5. MVP 中店長可將新版模板重新安裝成另一份店家 flow；舊 flow、已發布版本與 Lead 歷史均保留。
6. 第一版只記錄來源版本與更新可用狀態；差異比較、選擇性更新與合併策略為後續 Marketplace 能力。

複製店家流程會建立新的 flow identity 與草稿，不共用可編輯 steps 或發布狀態。任何修改都先寫入草稿；發布才產生不可變、可執行的版本快照。

## 7. Step 與題型契約

每個 step 均須具有：`stepKey`（同一流程版本唯一）、顯示內容、是否必填、驗證規則、答案儲存欄位、錯誤提示與明確的下一步。第一版為線性流程，下一步只能是下一個排序 step 或結束。

| 分類 | 型別 | 顯示／輸入 | 驗證與儲存 |
| --- | --- | --- | --- |
| Message | 純文字 | LINE text | 不存答案；送出後前進 |
| Message | 開場 Flex | 預先驗證的 Flex payload | 不存答案；送出後前進 |
| Message | 完成 Flex | 預先驗證的 Flex payload | 不存答案；只能位於完成前 |
| Question | 自由文字 | 顧客輸入文字 | 非空（必填時）、長度上限；存為文字答案 |
| Question | 單選 | Quick Reply 固定選項 | 值必須在該版本選項集合；存選項 value／label snapshot |
| Question | 台灣手機 | 顧客輸入電話 | 正規化後符合台灣手機格式；加密／受保護保存，log 僅可記遮罩值 |
| Action | 建立名單 | 無顧客輸入 | 依 conversation 與 flow version 的冪等鍵建立 Lead |
| Action | 完成流程 | 無顧客輸入 | 轉為 `COMPLETED`，不得再次執行完成 action |

電話接受常見輸入形式後再正規化為一種儲存格式，並以加密欄位保存；另存不可逆 hash 供去重或查詢。完整電話不得以普通明文 JSON 放在 Answer 或 Lead，僅通過後端權限驗證的必要畫面可讀取完整值。Flex 只允許經 schema validation 的安全 payload，不能由 runtime 任意代入不受控 JSON。

## 8. 多店、Channel 與權限隔離（強制）

- 所有讀寫、唯一性查詢、快取鍵與背景工作都必帶 `storeId`；不存在跨店 fallback 或預設店家。
- Store 必須由已驗證的 LINE `destination`／Channel identity 解析；不可由訊息文字、請求參數或未驗證 header 指定。
- 驗證 signature 與回覆 LINE 均使用**同一已解析 store 的** Channel 設定；A 店不得使用 B 店 token／secret。
- 一次 conversation 必須同時固定 `storeId`、`channelIdentity`、`lineUserId`、`flowId` 與不可變 flow version snapshot。
- 店家流程、草稿、發布版本、Lead、Answer 與 Log 的每次後端查詢均以 session／授權後的 `storeId` 限縮；不得只以模板 ID、flow ID、conversation ID 或 Lead ID 存取。
- 品牌流程與店家流程是不同 scope。品牌流程不得寫入 Store `Customer`，也不得透過任意店家 fallback 寫入資料。
- API／Server Action 必須在後端驗證角色及店家範圍；UI 隱藏不是授權。

## 9. LINE webhook 執行順序與衝突規則

後續 webhook 擴充必須保留既有處理行為，並按下列順序加入流程引擎：

```text
1. 驗證對應 Channel 的 signature
2. 依 destination 辨識品牌或 Store Channel
3. 處理系統保留指令
4. 檢查該 (storeId, channelIdentity, lineUserId) 的進行中 conversation
5. 檢查該店已發布且啟用流程的觸發條件
6. 未命中時，交回既有一般訊息處理
```

系統保留指令優先於任何店家模板，至少包含手機號碼綁定、六碼綁定碼、重新綁定相關指令及既有系統必要關鍵字。模板建立／發布時必須驗證觸發字不可與保留指令衝突；衝突即不可發布。若多個店家流程使用同一觸發字，第一版視為發布驗證錯誤，不採不透明的優先級。

## 10. Conversation 狀態與生命週期

狀態為 `IDLE`、`IN_PROGRESS`、`WAITING_INPUT`、`COMPLETED`、`CANCELLED`、`EXPIRED`。`IDLE` 表示尚未建立有效進行中對話；已持久化 conversation 通常從 `IN_PROGRESS` 或 `WAITING_INPUT` 開始。

- 同一 `(storeId, channelIdentity, lineUserId)` 同時只能有一筆 `IN_PROGRESS`／`WAITING_INPUT` conversation。
- 啟動時固定流程發布版本快照；後續發布新版不改寫舊對話。
- 「重新開始」只將同一 scope 的未完成 conversation 標為 `CANCELLED`，再從當前發布版本開始；不得取消其他店／Channel 對話。
- MVP 固定 24 小時未有有效輸入即標為 `EXPIRED`。過期 conversation 不續接舊答案；顧客其後再次輸入觸發詞時，從當前發布版本建立新的 conversation。模板可調整的超時時間留待後續版本。
- `PAUSED` 與店家總開關關閉均阻止**新** conversation，但已開始的對話允許完成。總部撤銷 entitlement 則立即安全中止該店所有未完成 conversation：不得再回覆、前進 step 或執行 action。

## 11. Lead、去重與安全紀錄

Lead 至少具有 `storeId`、`flowId`、`conversationId`、`lineUserId`、`lineDisplayName`、`submittedAnswers`、`status`、`source`、`createdAt`、`updatedAt`。狀態列舉為 `NEW`、`CONTACTING`、`QUOTED`、`WON`、`LOST`、`PAUSED`。

建立 Lead 必須對 `(storeId, conversationId, completionActionKey)` 冪等：LINE redelivery、重試或 action 重放不可產生重複 Lead。LINE event 的第一順位冪等鍵為 `webhookEventId`。若該欄位缺失，必須以 `storeId`、`channelIdentity`、`lineUserId`、event timestamp、`messageId`、event type 與 flow／conversation context 建立 deterministic hash。實作必須使用資料庫唯一約束或等價的原子防重機制；重送不得重複回覆、前進 step 或建立 Lead，且不得保存 raw body。

`DigitalButlerExecutionLog` 可記錄：時間、store／flow／conversation 的安全識別、事件類型、處理結果、重試／去重結果與遮罩後錯誤碼。不得記錄 raw request body、Channel secret、access token、signature、完整電話、完整 LINE ID 或完整答案。電話與 LINE ID 在 runtime／execution log 中必須遮罩或以不可逆相關識別取代；完整電話只供通過後端權限驗證的必要畫面使用。

Webhook 中任何流程錯誤、訊息回覆失敗或單一 event 例外都必須被隔離、寫入安全錯誤事件並回覆成功的 webhook acknowledgement（不得 500 造成 LINE 重送風暴）。發布前必須完成完整 schema validation；無效流程不可發布。

## 12. 發布模型

流程狀態為 `DRAFT`、`PUBLISHED`、`PAUSED`、`ARCHIVED`。

| 狀態 | 可編輯草稿 | 新對話 | 已開始對話 |
| --- | --- | --- | --- |
| `DRAFT` | 是 | 不可 | 不適用 |
| `PUBLISHED` | 可另建草稿 | 可（若三層開關皆通過） | 依其啟動版本繼續 |
| `PAUSED` | 是 | 不可 | 允許完成 |
| `ARCHIVED` | 不可直接使用；需複製 | 不可 | 歷史仍可稽核 |

「發布」將草稿驗證後建立不可變版本快照並指向目前發布版本；編輯草稿絕不影響已發布版本。預覽只使用草稿的模擬／測試會話，不能建立正式 Lead、寫入既有 Customer 或向真實顧客推播。若總部撤銷店家 entitlement，這是高於流程狀態的強制停用：未完成對話立即安全中止，不再回覆或執行 action。

## 13. 與既有系統的隔離

數位管家可共用 Store identity、LINE Channel identity、登入與權限系統，但以下核心不可被 PR-1 至 PR-6 修改行為或依賴流程成功與否：

- Booking 與 booking capacity
- Wallet／堂數、Payment、Check-in
- Customer LINE binding
- Reminder 與既有店家 LINE config／訊息

流程引擎須作為 webhook 中可失敗隔離的附加分支。它不能攔截系統保留綁定指令，不能阻塞一般訊息處理，也不能將錯誤傳遞到預約、付款或既有通知。若隔離無法保證，該功能不得發布。

## 14. 首個官方模板：真人諮詢管家

此模板是通用引擎驗證資料，不是專用程式碼。

| 順序 | 型別 | 定義 |
| --- | --- | --- |
| 觸發 | 關鍵字 | `我想了解適合我的方案` |
| 1 | 開場 Message | `真人管家會協助您` |
| 2 | 自由文字 Question | `店名`，必填，儲存欄位 `storeName` |
| 3 | 單選 Question | `最想改善的問題`：增加新客／顧客回流／會員管理／預約管理／LINE 通知／不知道從哪開始／其他；必填，欄位 `improvementNeed` |
| 4 | 手機 Question | `聯絡手機`，必填，欄位 `phone` |
| 5 | Action | 建立 Lead，來源標記為官方真人諮詢模板 |
| 6 | 完成 Message／Action | 顯示完成訊息並完成流程 |

實際官方文案、Flex 樣式與完成訊息可在官方模板版本中調整，但不得改變此引擎契約。

## 15. PR-1 至 PR-6 建議順序

| PR | 主題 | 交付與前置條件 |
| --- | --- | --- |
| PR-1 | 資料模型與權限基礎 | 經審核的 schema／migration、permission、entitlement 與 store-scoped repositories；遵守本文件隔離與 snapshot 契約 |
| PR-2 | 模板／流程管理後台 | 官方模板與店家副本、草稿編輯、發布 validation、預覽；所有頁面／actions 完成權限檢查 |
| PR-3 | LINE 執行引擎 | 以最小、隔離的 webhook extension 實作 signature 後的順序、conversation、題型與安全回覆 |
| PR-4 | Lead 與營運介面 | 店內 Lead 清單／狀態、總部授權跨店檢視、稽核紀錄與個資遮罩 |
| PR-5 | 官方真人諮詢模板與端對端測試 | 以資料模板安裝、執行、redelivery、暫停與版本快照測試驗證引擎 |
| PR-6 | 上線防護與擴充準備 | rollout／觀測、權限與隔離審計、官方版本可用提示；不引入非 MVP 功能 |

每一 PR 都須先驗證前一 PR 的隔離契約。Production、LINE Developers、Vercel 環境變數與 Cloudflare 不在本計畫範圍內。

## 16. MVP 驗收標準

1. 授權店家的店長可從官方模板安裝副本或建立自訂線性流程，加入／刪除／排序題目，完成草稿預覽與發布。
2. LINE 事件經 signature 與 destination 正確解析後，只會進入同一店、同一 Channel 的已發布且啟用流程。
3. 系統可由 conversation snapshot 記住題目位置；回答寫入其 conversation 的 Answer，完成後冪等地建立 Lead。
4. 官方模板更新只顯示新版可用；不覆蓋店家副本或進行中對話。
5. 任一開關關閉時，新流程停止；Booking、Payment、Wallet、Check-in、Reminder、LINE binding 與既有訊息仍按原行為運作。
6. 多店、流程、對話、Lead 與 Channel token 均無 fallback；未授權查詢與跨店嘗試被後端拒絕。
7. 保留指令先處理；衝突 trigger 無法發布；無效 flow 無法發布。
8. redelivery 或重試不會重複建立 Lead；流程或回覆錯誤不造成 webhook 500，且 log 不洩漏個資或 secrets。

## 17. 已定案決策與後續設計事項

| 項目 | MVP 定案 | 後續設計事項（不阻擋 PR-1） |
| --- | --- | --- |
| Conversation 超時 | 固定 24 小時；到期為 `EXPIRED`，不續接答案，再次觸發建立新 conversation | 模板可調整超時時間與允許範圍 |
| 暫停與 entitlement | `PAUSED` 阻止新對話、既有可完成；撤銷 entitlement 立即安全中止未完成對話 | 總部緊急中止的稽核／通知 UX |
| 官方更新 | 只顯示新版；不自動覆蓋或合併；可重新安裝為新 flow，歷史保留 | 差異比較、選擇性更新、三方合併 |
| 電話保存 | 正規化後加密保存，另存不可逆 hash；一般 JSON 與 runtime／execution log 不存完整值；完整顯示需後端授權 | 金鑰管理、保留期限、匯出規則 |
| LINE redelivery | 優先 `webhookEventId`；缺失時使用指定欄位的 deterministic hash；唯一約束或等價原子防重 | 供應商欄位可用性監測與 fallback 時窗 |
| 同 trigger 衝突 | 阻止發布 | 顯式優先序或互斥群組 |
| 總部授權 | 明確跨店 permission，預設拒絕 | 與既有角色／品牌營運身份的正式對應 |
| 預覽 | 測試會話，不發真實訊息、不建 Lead | 測試身分與預覽 UI 的具體方案 |

後續設計事項不得以預設店家、隱性優先序或直接改寫既有系統的方式繞過本規格。
