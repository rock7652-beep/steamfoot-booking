# 獨立測試 LINE OA：唯讀盤查與本機準備

2026-11-26（台灣時間），接續 Draft [PR #1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)。前階段 [不外發 HTTP 驗收](digital-butler-line-webhook-acceptance.md)有效；本輪只做設定中繼資料／隔離庫權限盤查、本機程式及測試，不建立 OA、憑證、通行連結，不改 Webhook、DB 政策、AI 控制或外發。

[機器可讀盤查](../../artifacts/ai-digital-butler/line-platform-preparation/inventory.json)／[離線報告](../../artifacts/ai-digital-butler/line-platform-preparation/report.json)／[隔離庫唯讀證據](../../artifacts/ai-digital-butler/line-platform-preparation/database-readonly.json)。沒有解密環境變數，報告只有變數名稱、範圍與公開設定的指紋；敏感值不可回讀不表示未設定。

## 已核實與尚無法核實的 OA 清單

| 對象 | 現有證據 | 本輪結論 |
| --- | --- | --- |
| 竹北／新竹／台中 OA | 原 line-config.ts 有各店對應與既有公開 basicId；Vercel 有各店 LINE_* 記錄，其中部分同時列 Production／Preview target | 是既有門市配置，不借用為獨立測試 OA；未聯絡 LINE API 檢驗 token 或改原 Webhook |
| 蒸管家品牌 OA | STEAM_BUTLER_LINE_* 的 Preview 設定記錄，原 Webhook 先以品牌簽章判別 | Preview 範圍不證明它是專用測試帳號，不能直接改其用途 |
| 共用／新店登錄 | readStoreLineConfigs 及 STORE_LINE_CONFIG_JSON／STORE_LINE_ADDITIONAL_CONFIG_JSON 機制 | 有註冊機制，但指定 AI Preview 沒有有效的這兩項登錄，不把原程式或歷史驗收文件當線上登錄 |
| 四個合成店 | 都是 isDemo、lineDestination 都空，店家 channels 全為 TEST | 尚未登錄獨立測試 OA |
| LINE 平台實際 OA／Provider 清單 | 目前沒有可直接列出使用者 LINE OA 的已連線管理工具或已確認的 LINE 管理工作階段 | 未核實是否另有既存測試 OA；不能據此宣稱不存在。需帳號管理者確認 |

`getLineSecretForStore` 優先用明確 store config，之後才是原三店 map；不修改它來借正式 secret。新環境變數只可在未來取得授權後設為指定支線 Preview 的 Sensitive，不能沿用同名跨 Production／Preview 的記錄。現有旗標 AI_EXTERNAL_DELIVERY_DISABLED=1、AI_DIGITAL_BUTLER_PREVIEW=1、BEAUTY_NOTIFICATIONS_ENABLED=0 與 aws1 transaction pooler 模式的指定支線值皆已核對。

## 真實平台收發仍有六項阻擋

1. **帳號與測試使用者未選定。**需獨立 OA、明確 Messaging Provider／channel／bot destination，以及 1–2 位測試 LINE 使用者。實際權限與 OA 是否正服務顧客須由管理者確認，不能從變數名稱推斷。
2. **LINE 伺服器尚無可達的測試入口。**既有 Preview 保留 Vercel 保護，不能將操作員的 cookie、OIDC header 或前輪已撤銷的分享連結當 LINE 平台能力。Vercel 官方有 query bypass 供第三方 Webhook 使用，但會在 URL／平台與代理日誌暴露 bearer secret；專案級 token 可能超過單一部署範圍，本輪不建立或使用。
3. **需要 Messaging-only 的合成 OA 登錄。**目前通用登錄要求 Login／LIFF 欄位；首輪建議只驗 Guest 公開知識與 Mock，沒有理由先要求使用者建立 Login／LIFF。新增的離線提案 schema 已可表達 Messaging-only 描述，但它還不是 runtime 登錄或授權。
4. **原流程的真實 repository 尚無測試寫入政策。**角色對 DigitalButlerExecutionLog 的 INSERT／UPDATE 都為 false，RLS 開啟。原 runtime 在 claimEvent 就需要這些操作；fixture 使用 request-local driver 的結果不能當成這條路徑已就緒。先準備固定合成範圍的 repository／政策與回復方案，取得需要的 DB 寫入批准後再安裝，不給全表或正式資料寫入權。
5. **會員身分目前不能完整查回。**Account／CustomerIdentityLink 雖有 SELECT table grant，但 RLS 開啟且沒有此測試角色政策，因此會看不到對應列；不能把空結果當成已確認會員。首輪可明確以 allowlisted Guest 驗公開知識，仍需安全調整 guest admission，不能偽造會員或放寬 canonical resolver。真實會員 Login 留下一階段。
6. **尚無真實 sender 與可開放 LINE 的設定流程。**現有回覆只是 OUTBOUND_BLOCKED sink，沒有 replyToken／LINE API；AiButlerSetting 儲存只允許 TEST。後續需要獨立、限時、單 OA／單店／測試使用者名單的 transport，保留持久去重、UNKNOWN、不重送與人工 revision 核對；不能直接關閉全站 preview lock 或當成清舊 sink 佇列的機會。

真實平台的 eventId、messageId 與 deliveryContext 必須沿用原始值。LINE 官方指出重送事件的 eventId／replyToken 維持原值；既有雙 alias 防重必須保留，不能只看 isRedelivery。實際 reply token 有效性、一次性使用、逾時及回執需按最新 LINE 規格測試；本輪沒有傳送訊息，不將已完成的 sink 收據當成真實 API 回執。

## 已實作的離線預檢

[ai-line-platform-preflight.ts](../../scripts/ai-line-platform-preflight.ts)只讀盤查 JSON 和選用提案 JSON，不載入 .env、Prisma 或網路服務。輸出永遠 readyForLiveRun=false，不能藉提供「都已就緒」的 JSON 取得權限。

提案須固定四店中的單一 isDemo 店、確認專供測試的 OA、Provider／Messaging channel／destination、1–2 個不重複的測試使用者 SHA-256、最多 30 分鐘／4 則回覆、真實 OpenAI 0、Guest 公開知識模式。憑證只接受 LINE_AI_TEST_CHANNEL_SECRET／LINE_AI_TEST_CHANNEL_ACCESS_TOKEN 的名稱，拒絕 token 值、其他欄位、公開前綴及原門市憑證名稱；記錄必須僅屬指定支線 Preview Sensitive。既有 destination 指紋、跨環境憑證、過期窗口、非 Demo 或尚未恢復停止皆有阻擋測試。

這些是下一輪待批准的保守上限與提案驗證，沒有提高原店家日／月／費用限額，也不是使用者已同意外發的證據。

```sh
npx tsx scripts/ai-line-platform-preflight.ts artifacts/ai-digital-butler/line-platform-preparation/inventory.json
npx vitest run src/__tests__/ai-line-platform-preflight.test.ts src/__tests__/store-line-config.test.ts src/__tests__/ai-digital-butler-line-webhook.test.ts src/__tests__/ai-digital-butler-line-webhook-route.test.ts src/__tests__/preview-external-integration-isolation.test.ts
```

本機 5 檔／121 項通過、ESLint 與型別通過；fetch 替代埠斷言 0 呼叫。沒有變更 runtime、UI、HQ 控制、資料庫或部署設定，因此不新增 Preview 或 UI／RWD 驗收；保留原 Framework、HQ 三態、原人工清單及已驗的多店／預算／去重守衛。新的工具未接到可啟用的 UI 或 server action。

## 最小必要操作、風險與授權順序

| 順序 | 最小操作 | 風險／取得授權前的界線 |
| --- | --- | --- |
| A | 管理者確認已有專用測試 OA；若沒有，另批准建立一個，於 LINE Official Account Manager 啟用 Messaging API | 建立外部帳號／選 Provider，需要帳號所有人操作；不可借用營運 OA，不購買方案或 add-on。先只提供名稱，不在聊天貼憑證 |
| B | 選定一間合成店；由管理者提供 OA 的非秘密識別資料，並將新 secret／token 存為指定支線 Preview Sensitive | 新外部憑證須明確批准；不能解密／搬運既有門市 token，不修改 Production、Development 或全部 Preview |
| C | 審查僅測試入口可達的方案，再修改該獨立 OA 的 Webhook | 現有保護下 LINE 會被擋。優先核實只針對測試 hostname 的例外能力；若會公開整個測試 hostname，要明確揭露範圍並批准。若無法隔離，另提獨立入口方案，不改共享專案的 Production／全域保護 |
| D | 準備 scoped registry、原流程測試 repository／最小 DB 政策、受控 sender，先 Fake transport＋本機／CI，再做必要單次 Preview | 目前仍缺 runtime 實作及真實資料來源；本輪預檢成功不代表這些已完成，也不應先將 token 加入尚未核對的入口 |
| E | 另批准一次 30 分鐘、單 OA／單店／測試使用者、最多 4 則回覆、OpenAI 0 的 Mock 收發；管理者用測試 LINE 帳號發送指定訊息 | 真實 LINE 回覆會到指定測試使用者並可能占 LINE 方案用量，非真實顧客。短暫解鎖只限該次；無論結果都停止、關店、撤銷入口授權與清除登入；不補發舊事件或提高額度 |

在 A–E 各項獨立範圍未核對與批准前，本輪不執行外部變更。首次只需管理者確認是否已有獨立測試 OA／其名稱；其他原準備工作由工程端承接，不要求使用者自己查程式、DB 或 TLS。

## 本輪安全結論

隔離庫仍 stopped=true，四店 disabled／TEST；Request 53、OpenAI 5、Dispatch 113、未決 0，與前輪收尾一致。沒有建立任何新帳號、憑證、分享連結，沒有 LINE／OpenAI API 請求或訊息外發；Production 與 main 不變，PR 仍 Draft。現況報告是唯讀快照，不授權未來變更。

參考：[LINE 啟用 Messaging API](https://developers.line.biz/en/docs/messaging-api/getting-started/)、[LINE 收訊與重送](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)、[LINE Reply API 規格](https://developers.line.biz/en/reference/messaging-api/#send-reply-message-reply-token)、[Vercel 第三方 Webhook 存取](https://vercel.com/docs/deployment-protection/automated-agent-access)。官方文檔不取代帳號所有人或本輪授權。
