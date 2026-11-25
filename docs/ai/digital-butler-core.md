# AI 數位店長：Phase 0 / Phase 1 工程契約

狀態：開發候選，Mock 可驗；未發布、未接管正式客服。主線基準 `378cd9475317f6c4ab804f0e48642f1d4f0f567a`（2026-11-25 核對）。

## 共用架構及沿用範圍

沿用 [UI Framework](../STEAMFOOT_UI_Settings_Framework.md)、[數位管家規格](../architecture/digital-butler-template-system.md)、[HQ 三態](../hq-feature-three-state.md)。One Core / Multi Module / Multi Tenant / Single Production Project；未新增 Vercel 或資料庫專案、方案、收費系統或側欄。

| 層 | 程式 | 本次成果 |
| --- | --- | --- |
| Provider | `src/server/ai/provider.ts` | OpenAI Responses、Mock、模型白名單、輸入／輸出上限、逾時、嚴格輸出驗證、錯誤遮罩 |
| Conversation | `service.ts` / `repository.ts` | store + channel + channel account + verified actor 的 HMAC scope、原子去重、有限來源摘要、人工接手、晚到結果抑制 |
| Knowledge | `knowledge.ts` / `contracts.ts` | STORE / MODULE / SYSTEM、版本、發布狀態、期限、來源選擇；目前只提供合成測試資料 |
| Tools | `tools.ts` | 共用註冊、參數 schema、伺服器 scope、模組與權限；知識階段全面停用工具，未註冊業務操作 |
| Usage | `repository.ts` | PostgreSQL 原子預留、全域及店家預算、台灣日／月次數、併發、Token、時間、錯誤及轉接計數 |
| UI | 既有 `settings/digital-butler` | 單一原入口、AI 獨立授權、測試開關、四模組合成情境、Mock 回覆、人工接手與用量摘要 |

確定性流程繼續使用 `digital-butler-runtime.ts`。**TypeScript 路徑別名會把 runtime 導到 `digital-butler-runtime-with-handoff.ts`，再委派 core 並適配課程連結**，不是不存在或未使用的檔案。`digital-butler-provider.ts` 是通路顯示名稱，與新的模型 Provider 職責不同。原服務／repository／流程定義／全域指令／LINE reply 共用原行為。

LINE 現行簽章與 destination 解析在 Webhook；保留指令、方案回應、通知／會員綁定與進行中流程優先。Messenger 也沿用既有 runtime 與交接。**本階段未改 Webhook、LIFF、Rich Menu，AI service 僅接受 TEST 通路**。日後只可在原 runtime 未處理的分支擴充 AI；必須同時核對原真人接手狀態及原子事件權，才可交付通路 intent。不能把本次合成客服接手狀態冒充已串接真人名單或通知。

四模組共用 `AiModule` 與工具契約。蒸足預約服務、Beauty 原生服務，以及音樂／運動 course 業務服務仍各自掌握名額、方案與交易規則。Phase 2/3 才接入已驗證的現行業務服務，不能由 AI 寫表。本次沒有複製營業時間、方案或價格作長期知識副本。

## HQ、權限與安全

`FEATURES.AI_DIGITAL_BUTLER` 是獨立加購權益：所有既有方案（含 EXPERIENCE）預設不含。沿用 StoreFeatureEntitlement 的 HIDDEN / LOCKED / ENABLED / INHERIT 與起訖時間。沒有新增三態資料結構，原價格與權益不變。一般關閉 AI 不影響原數位管家、會員、預約或通知。

伺服器 action 經 `requireWritablePermission('plans.edit')`（內含 `requirePermission`）、`resolveWriteStoreId` 及 `requireStoreFeature`，不接受前端 storeId、顧客文字、憑證或模型作為可信 scope。Page 先 `checkPermission`。模型僅選擇本店已發布、未到期的單筆來源；後端回覆原文或轉人工，模型不能自行生成價格、折扣、退款承諾或會員權益。這可限制生成內容，不代表語意選擇永遠正確，仍需真實模型與資料評估。

現行執行另外限制：精確 Preview 環境 + 四個新建合成店 ID + TEST 通路。即使誤把權益開給其他門市，也不能執行本階段 action。資料表沒有供 anon/authenticated 使用的權限或 policy。

知識與使用者內容皆放在不可信資料區；模型不接收完整店家 ID、身分、資料庫或通路憑證。電話、Email、Key 及通路身分有基本遮罩，但遮罩不是完整個資辨識。本階段 UI 限固定合成情境，沒有自由輸入真實顧客資訊的入口。

接手與關閉在模型等待期間發生時，settle 會再次核對 global、HQ、店家與接手狀態，抑制晚到回覆。接手沒有自動計時恢復，須授權人員明確恢復。Provider／結算失敗保留 UNKNOWN 成本及接手狀態；若資料庫也失敗，RESERVED 持續占額，不擅自判為未花費。

## 預算與模型契約

集中設定 `AI_LIMITS`：全域 Preview **累計 US$20**、每店預設每月 US$1、每日 20／每月 100 次、全域同時 2／每店 1、單次保守輸入上限 8192／輸出 256 Tokens、12 秒逾時、最多 1 次嘗試（零自動重試）、來源摘要最多 4 筆。店家上限可由既有 action schema 管理，正式 AI 套餐尚未定價。

請求前鎖定同一 `AiButlerControl` row，原子計算所有已計入與預留，再寫 RESERVED。鎖不跨模型網路呼叫。預算滿、無法確認、未核實費率或依賴缺漏都停止；UNKNOWN 不釋放，程序中斷留下 RESERVED 也不自動過期釋放。兩個獨立 PostgreSQL 連線已驗證無法花掉相同剩餘額度。全球累計不會隨台灣日期自動歸零；店家日／月使用共用 date-utils。

僅允許 `gpt-6-luna`、`gpt-5.4-mini`、`gpt-6.2-sol`。依模型使用官方有列出的 Responses／結構輸出能力；Luna／5.4 mini 使用 none，Sol 使用 low reasoning，沒有共用 temperature 等未核實參數。API 使用固定官方 endpoint、`store:false`、`background:false`、Standard tier、無內建工具、無第三方 Provider。輸入以完整序列化 UTF-8 bytes 加協定餘量作保守界線，不假稱精確 tokenizer。

`AI_VERIFIED_MODEL_CONFIG_JSON` 逐模型載入 input/output 的保守美元 micro 上界、官方來源、verifiedAt、validUntil 及能力確認；核對有效期最長 7 天，過期或缺失禁止新 OpenAI 請求。不把促銷福利當固定免費或支出硬上限。

2026-11-25 官方文件核對：Standard 公開價（每百萬 Tokens）Luna input US$0.10 / output US$0.50；5.4 mini US$0.75 / US$4.50；Sol US$2 / US$10。快取寫入、保留時間及處理區域可能額外影響費率，因此**預留與估算不能直接只用公開 input 基價**。已寫入僅指定 Preview 支線的有期限費率配置，尚未核對供應商實際帳單；本次保守上界 Luna 1/1、mini 1/5、Sol 10/20 USD per million，每次重測前仍須確認配置有效期；本次只對 Luna 完成真實 API，相容性結果見驗收紀錄。

ledger 的 `heldMicros` 含已計入及未明成本，`estimatedMicros` 是以實際 Token 數乘保守上界的估算，**不是供應商實際扣款**。目前未取得實際美元成本或帳單 API 權限，不假稱已對帳。50/80/100% 由同一設定產生用量提示，沒有對外寄信或推播提醒。這個預算只管經本系統的請求，不能限制平台外部用量。

## 保存、隱私與輪替

不在一般 Log 或 ledger 保存完整對話、API Key、通路憑證或原始顧客識別。對話只保存最多 4 個來源 ID 摘要及 HMAC scope，7 天後不再讀取摘要；人工接手旗標維持到明確恢復。事件與用量 ledger 保留以支援去重、預算與稽核，不自動刪除造成歷史費用消失。

正式試營運前需另行確認 ledger 保存期間、可刪除／匿名化欄位、營運稽核需求與實作清理程序。目前只有合成資料，未安裝正式刪除排程。摘要邏輯到期不等於資料實體已刪除。

OpenAI `store:false` 不等於帳號已具 Zero Data Retention；預設濫用監控資料仍可能保留最多 30 天等例外。實際專案資料控制、分享訓練／免費 Token 選項及隱私告知未經此帳號 UI 核對，不得在正式客服使用前略過。未啟用資料分享。

使用者告知 Preview Key 到期日 **2027-02-23（台灣時間）**。輪替檢查日 2027-01-24、02-09、02-16、02-22；這是 runbook 日期，**尚未建立外部提醒或排程**。到期前由持有人在 OpenAI Project 建立新的 Restricted service-account Key，只保留 List models Read / Responses Write 與三模型白名單，更新指定 Preview branch Secret，做最小合成測試後撤銷舊 Key。正式環境另建正式 API Project 與獨立 Key。

來源：[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)、[mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)、[Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol)、[資料控制](https://developers.openai.com/api/docs/guides/your-data)。

## 目前邊界與後續驗收

2026-11-26（台灣時間）完成 Phase 0/1 隔離 Preview：原憑證連線、認證 UI／server actions、Mock、Luna 兩筆最小 API、Token／預算結算與 RWD。收尾 global stop=true、四合成店 enabled=false；正式 AI 未開放。Provider 明示已驗證的 PUBLISHED 參考來源、schema 限定單筆已提供 ID，後端仍重新核對來源並呈現原核准文字。知識編輯／發布管理、現行營運資料 adapter、原通路未命中整合、真人客服工作台交接、真實業務讀取／寫入均未開放，不能視為 Phase 2/3 已完成。

見 [Runbook](digital-butler-runbook.md)、[驗收紀錄](digital-butler-acceptance.md)。
