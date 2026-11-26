# 隔離 AI 待人工處理

AI 轉真人目前會保存旗標，但店長只能操作自己正在測試的對話。這次在同一數位管家設定頁加入本店隔離對話清單，直接讀取既有 AiButlerConversation，允許管理者核對後恢復其他測試範圍；不另建潛在顧客、複製訊息或呼叫通知服務。

原有真人名單依賴已取消的 DigitalButlerConversation、flowId 與 completionActionKey。AI 未命中不一定存在原流程對話，不能虛構 flow 或把 AI 旗標冒充已建立原生客服名單。本次只提供 Preview 對話管理；正式日常客服工作台仍需沿用原營運入口另行介接，不能將測試管理永久當成設定中心內的日常營運功能。

## 操作與資料

- 原入口、plans.edit、獨立 AI 權益及四個 fixture store guard 不變。SSR 提供完整當頁資料；同頁刷新／翻頁沿用 RSC，不另建 client 資料快取。每頁 25 筆、穩定 scope 排序與 keyset cursor，總數與當頁出自同一 SQL 快照；讀取失敗不顯示 0 筆。
- 顯示不可反推身分的測試對話代碼、接手狀態與最近測試時間；時間由伺服器使用 Asia/Taipei 共用函式產生展示字串，客戶端直接呈現，避免 Node／Chrome ICU 空白字元不同造成 hydration mismatch。不顯示顧客訊息、LINE ID 或帳號憑證。scopeKey 只作本店資料定位，不是權限證明。
- 準備恢復 → 核對確認 → 伺服器成功 → 刷新目前頁。取消不寫入；唯讀檢視不可恢復。RWD、收合與資料刷新保留介面狀態；切換帳號／店家用 viewKey 隔離，舊回應不帶入新工作區。
- 恢復只將指定對話 handoff=false、清除摘要並增加 revision。所有其他 AI 開關、全域停止、預算、用量與原客服名單都不變；舊結果仍受原有 revision guard 抑制。

## 原子操作與稽核

每個操作核對 writable permission、目前 actor／store 與 AI 權益，啟動交易前再次確認工作區。取得全域鎖後，透過同一交易連線及 DB 時間重查 HQ 權益與對話版本。權限 helper 會使用共用連線池，不能放在已佔用唯一連線的交易回呼內。viewKey 是由伺服器為該 actor/store 推導的 HMAC，避免舊工作區操作落到新門市；前端不得指定 storeId、actorId 或模組。

客戶端保留 UUID commandId 到結果確認；不明結果只重試同一命令。私有 AiButlerHandoffAudit 以 storeId／HMAC commandKey 去重，保存 HMAC actor／scope、預期及成功版本與時間。重送回原收據，不能覆蓋後續接手。另一人已更新則回報版本衝突。更新與 audit INSERT 同一交易，寫紀錄失敗時回滾接手狀態。

本清單遇到 Request RESERVED／UNKNOWN，或 Dispatch CLAIMED／UNKNOWN，拒絕恢復，先核對原事件；不刪除帳本、不釋放預留、不重新呼叫模型。這是新管理操作的保守限制，不宣稱已實作未知 API 費用對帳；原合成情境控制保留原明確操作契約。

## 安裝與安全

只在 steamfoot-preview（ttworfzgwejdeolegkxl）手動安裝 [preview-handoff.sql](../../scripts/sql/ai-digital-butler/preview-handoff.sql)，checksum `06f6b00a9ef123153483687e90ceb7a00dc5c4494871cce5a8bc523f1ddbc6af`。此表啟用 RLS，PUBLIC／anon／authenticated 無權限；既有隔離角色僅 SELECT／INSERT、限四合成店，不授 UPDATE／DELETE 或商業表寫入。沒有正式 migration、資料庫新專案或 DB／Vercel Sensitive 憑證改動；合成登入帳號按既有測試流程輪替暫存密碼。

既有未解安全建議不在本次擴大處理。停用本功能可回到既有 Preview 程式或維持總停止；新表保留稽核資料，不以刪除紀錄回復。Production、Development、其他 Preview、真實 Webhook／LINE／Messenger／Email、商業資料與會員綁定都不在本次寫入範圍。

本機測試涵蓋跨店、跨 actor、51 筆分頁、版本衝突、結果不明重試、audit 回滾與 RLS；真實 PostgreSQL 另驗兩個獨立連線競爭同一版本只成功一次。UI local driver 使用替代 actions，不能當成雲端登入驗收或實體裝置結果。最新雲端驗收另以 PR 的精確 Preview SHA 及證據為準。
