# LINE Webhook 接入：隔離、零外發階段

接續 Draft PR #1596。既有 `/api/line/webhook` 接到共用 Routing／Service／帳本；這不是正式 OA 上線、外發或自動預約。上一階段兩筆真實 OpenAI 的驗收與成本仍以[原紀錄](digital-butler-line-e2e-acceptance.md)為準。本階段 HTTP 固定 Mock、真實 API 呼叫 0。

## 入口與信任邊界

- 只有 claimsAiPreview 的請求在舊 handler 前交給新 adapter；adapter 重新 assertAiPreview 完整 tuple、隔離 DB 與外發封鎖。錯誤 claim 直接拒絕，不退回舊 handler。Production 與其他支線保留原 LINE handler。
- 串流讀取原始 body，最多 64 KiB／10 事件。destination 只作不可信查找提示；由伺服器明確 OA 設定決定門市與 secret，先驗原始 bytes HMAC，再解析事件，拒絕另一 OA 的有效簽章。
- 僅接 active／user／text，必要 LINE userId、eventId、messageId、最多 500 字。群組、standby、follow、媒體、不完整及過期事件忽略，不進模型或舊聯絡人寫入；空驗證批次成功。時間窗為過去 5 分鐘至未來 30 秒；超時重送不消耗模型或發送。
- 一個 OA 必須明確綁定一間固定 isDemo 合成店。共用 OA 多店不猜第一間。未配置、非合成店或沒有獨立 AI 權益皆拒絕。產業由原權威來源取得，不採用請求中的 store/module/customerId。
- 真實簽章只證明 Messaging sender。依已核對的 Provider 帳號查 ACTIVE CUSTOMER，再沿用 canonical central membership 查同店且同 user 的唯一顧客；不用電話、email、姓名、舊 JWT 或 Customer.lineUserId 救回，不寫綁定。無帳號／無同店會員是 GUEST；停用、員工或衝突阻擋。Guest 只用公開知識，MEMBER 也不因此開放個人資料工具。
- 本階段只支援明確 PROVIDER OA；CENTRAL／共用 OA 的會員 namespace 不自動轉換或退回中央帳號。實際 OA 設定、真實會員及裝置未驗。

## 隔離 HTTP fixture

為了不借用真實 OA secret 而驗收同一 POST，`x-steamfoot-ai-fixture: 1` 模式必須先通過 staff session、plans.edit 及可寫門市，之後才接受公開 fixture HMAC。固定 destination／sender／六個合成問題，拒絕任意 sender、自由問題及跨店。Fixture 身分永遠是 GUEST，不冒充真實會員。

Fixture actor 綁定操作員，與舊 dashboard 演練 scope 分開。沿用既有合成原流程 driver，仍是 request-local，不能冒稱正式原流程跨事件持久驗收。非 fixture 分支沿用原 DigitalButlerRuntime 與資料庫 repository，錯誤阻擋 AI fallback；本輪沒有配置真實 OA 或擴大資料庫角色權限。

## 三層去重與不明結果

1. 同一交易認領 eventId 與 messageId 兩個 HMAC alias：同事件換訊息、同訊息換事件、平行重送不能重進核心。使用既有私有 AiButlerDispatch，沒有新表、migration 或 RLS grant。
2. 原 Routing Dispatch 及 Request 預留仍各自防重。模型前先核對原併發、日月次數及金額限制，再 settle；重送不另建事件或重扣費。
3. 回覆以獨立 delivery key 原子認領，只記 OUTBOUND_BLOCKED。Adapter 沒有 sender、replyToken 保存或 LINE API 呼叫；回應沒有答案本文、會員 ID 或憑證。這是零外發 sink 去重，不等於真實 LINE 傳送／回執驗收，不承諾 exactly-once delivery。

中斷保留 UNKNOWN alias、原 UNKNOWN／handoff；重送不重新呼叫模型或送訊。原始帳本與費用不清除、不重置。

## 流程、人工與安全控制

Routing／Service 的預設 capability 仍只接受 TEST；只有隔離 adapter 明確傳入 LINE capability，且 reserve 仍核對店家 channels。現有設定僅允許儲存 TEST，因此部署本身不會開放 LINE。

先檢查持久人工接手，再交原流程。原流程命中、等待欄位、驗證失敗、未開通或失敗都不誤入 AI，僅明確 NO_MATCH 才進模型。接手期間新事件、重載、換 Provider 都靜默，恢復沿用原待人工清單準備／確認及 audit。Provider await 後再核對門市、角色、身分、權益及對話 revision；settle 額外重查 channel，避免撤銷 LINE 授權後晚到答案仍被接受。

總停止、單店停止、HQ Hidden／Locked、預算與跨店限制沿用核心。HTTP 入口不載入 OpenAI Key 或 Provider，沒有真實 API 重試；沒有變更 AI 全域停止、四店設定、費率、環境變數、正式庫或通知停發。

## Framework 與驗收

依 [UI／Settings Framework](../STEAMFOOT_UI_Settings_Framework.md)、[HQ 三態](../hq-feature-three-state.md)及[操作情境](../operation-experience-scenarios.md)執行。本輪沒有 UI、CSS、導覽、Settings Panel、HQ 控制或共用元件修改，不建立第二個客服工作台；後台指南及 205／96 題數不變。三態後端授權有測試；不冒稱新增 HQ 操作、RWD 或真機驗收。

本機 10 檔／223 項通過，含實際 POST → 驗簽 → 共用核心 → PostgreSQL 引擎 PGlite → 阻擋回覆、平行雙 alias 去重、原流程優先、人工靜默、停止／配額、晚到結果、跨店及顧客權限。測試 fetch 禁止網路，原 Webhook、課程共用 OA、既有 TEST actions 一併回歸。身分及權威資料替代來源、PGlite 不當成真實 OA 驗收。

型別／ESLint、CI 與隔離部署結果另補實際證據。新版需要一次必要 Preview，舊 runtime 沒有此入口；支線 Git 自動建置 false，不為文件重建。平台單次費用／帳單未取得，無正式部署；Cloudflare 不是本次 Vercel 入口依賴。

前次通行連結授權僅限舊部署，不能延伸到新版。新版受保護 URL 的正向雲端測試若需要新通行連結，須核對本部署明確授權；不改用會建立 23 小時連結的 fetch 工具。TEST 維持停止；前輪 QA 登出 probe 修正版雲端重測繼續待驗，不因本機 HTTP 通過就銷項。
