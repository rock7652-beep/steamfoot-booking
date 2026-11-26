# 知識庫、真實模型與合成 LINE：隔離演練契約

沿用 Draft PR #1596 與既有數位管家頁，在原共用串接面板增加「合成 LINE 對話演練」模式。這是已授權店長使用固定 fixture 的 TEST 入口，不是正式 Webhook 或可營運客服。既有「原流程與 AI 串接」維持 Mock 與原輸入契約，不因新增模式而開放真實通路。

## 同一次執行路徑

`plans.edit／可寫店家／獨立 AI 權益／精確 Preview → 後端固定 LINE fixture → 共用 LINE HMAC 演算法 → 嚴格單事件驗證 → 原流程引擎 → 明確 NO_MATCH → 已發布知識快照 → Mock 或 OpenAI Responses → 核對來源及當下權限 → 核准文字顯示於測試頁 → 持久人工接手 → 既有待人工清單確認恢復／私有 audit`

模型只選擇已核准來源 ID；最終對外文字由服務呈現核准知識，不接受任意模型自由生成客服承諾。原流程命中或等待欄位時不進模型。未知問題由模型轉人工，明確要求真人不呼叫模型；接手後原流程與 AI 都靜默，切換 Provider、重載或新事件不解除旗標。

## 信任邊界

- Server action 只接受 UUID eventId、固定 scenario 與 mock/openai。storeId、module、actor、原始 body、問題本文、destination、replyToken 或通路憑證都不能由客戶端傳入。
- 後端依已驗證店長取得門市及真實產業，固定四個新合成門市；LINE 格式 destination 對應該合成門市及產業，不猜預設店家。事件只用固定假 UID，不取得會員權益。
- Fixture HMAC key 是公開測試常數，不是 OA Secret，也不是認證能力。真正授權來自 staff session、plans.edit、可寫範圍、AI 權益與隔離守衛。驗證沿用既有 verifyLineSignatureWithSecret 演算法，不讀取真實 OA 憑證。未驗真實 OA 綁定、LINE HTTP 入口或實際訊息傳輸。
- 一個合成來源 actor 綁定目前操作員的持久 TEST scope。帳本仍以 HMAC store/account/operator 隔離；fixture UID 不冒充真實 LINE 會員，也不寫 CustomerIdentityLink。
- 專用 account `dashboard-line-synthetic` 與舊 Mock 演練分開，Provider 不參與對話 scope，故不能以換模型解除接手。Provider 參與事件 fingerprint，改模型重用同一 eventId 會衝突，不能重新扣款。
- 先驗完整結構與原始 bytes 簽章才入路由。單事件、4 KiB 上限、固定 user／active text，拒絕群組、額外欄位、混店、改寫 eventId 等。沒有 sender、Webhook route 或任意外發 URL。

## 沿用帳本與操作

共用同一 Routing／Service／Request／Dispatch／Conversation，無新表或 migration。知識每次重新載入已發布版本，模型返回後再核對 fingerprint、來源有效性、帳號、門市、權益與操作世代。全球／單店停止、Token、併發及日月預算原封不動。

結果未確認時保留 eventId、scenario、provider 並鎖定輸入；重試只沿用原事件，不改 ID。重送已完成事件不呼叫模型。UNKNOWN 保留預留與接手，不自動釋放或另建事件。

人工恢復只用原「AI 待人工處理」準備／確認與 commandId／revision 機制；不新增可繞過稽核的 LINE 恢復按鈕。清單刷新與確認恢復的共用 snapshot 加入該操作員 LINE 測試狀態，版本比較避免較舊回應把接手狀態改回去。按鈕在 hydration 前停用，沒有新增導航或客服工作台。

## 驗收範圍與成本

先本機與 Mock，再最少兩筆真實 OpenAI：已發布問題回答、未知問題轉人工。重送、接手靜默及恢復以零額外真實模型請求驗證。原流程 repository 仍是請求內合成實作，不冒稱已完成正式原流程跨事件狀態整合。

2026-11-26 預查：四店皆停用、global stopped=true；總請求 47、估算 1,310 micros、Dispatch 65、audit 8；Booking 129、Customer 1,367。合成蒸足當日已達 20 次既有上限，不提高或重置。真實 API 演練改用已有已發布知識且當日 9 次的合成美業店，蒸足真實 API 不在本輪重測；未來暖暖試營運另行決定。

僅在隔離庫短暫開啟單一合成美業店 TEST 與總控制，其他三店保持關閉，真實 LINE／Messenger／Email 外發始終封鎖；收尾恢復 global stop 與四店停用，清除合成帳號臨時憑證、撤銷短效保護通行連結。不得讀取 OpenAI Key、增加預算、改 Production、購買服務或將 Preview promote。

必要 Preview 建置只驗本次程式，先完成本機檢查；同版演練與文件不重建。後台 AI-BUTLER-PREVIEW-01 僅補本入口與接手範圍，仍是 source-reviewed，不抵扣 205 題／96 待驗，不新增前台指南。真實通路、預約寫入、其他模型、真機與正式試營運均不由此開放。實際結果另存驗收紀錄，不以本契約當成功證據。
