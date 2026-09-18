# 各店 LINE 與延後試用起算實作

PR #1022，2026-09-18。程式實作不等於首店實機交付完成。無新增 migration；沿用 Account.provider、CustomerIdentityLink、Store、StoreSubscription、StorePlanChange。未改既有綁定或真實 LINE 設定。

## 本輪實作

- `STORE_LINE_CONFIG_JSON` 指定每店 storeId／slug、Provider、Login／Messaging channel、LIFF、OA destination／Basic ID 與金鑰 **環境變數名稱**。拒絕重複映射、不相容 Provider／LIFF channel、NEXT_PUBLIC 金鑰變數。
- exchange、Credentials authorize、onboarding 使用同一設定，驗證 LINE issuer／audience／expiry，再核對 DB 店別／COURSE 模組／既有 LIFF；不接受 client 指定 channel/provider。課程缺設定或 channel 不符不得以中央 token 通過。
- 獨立 Provider 使用 `line-provider:<providerId>`，不改原 provider=line 或 Customer.lineUserId。相同中央 Provider 僅在明確 `identityMode=CENTRAL` 且 `CENTRAL_LINE_PROVIDER_ID` 相符時沿用既有帳號；預設 PROVIDER。開通後不可任意更換 Provider／identityMode。姓名／電話重複只觸發衝突，不直接授權。
- 課程通知由固定本店會員／Provider／Account 所有人核對後取對象。缺設定、錯帳號、無法接收即阻擋，不轉中央帳號。發送前再核對 token 對應的 bot destination／Basic ID，preview 外發阻擋保留。
- 配置的 COURSE webhook 驗本店 HMAC 後，follow/unfollow 只更新既有同店身分的接收狀態；舊／重送事件不覆蓋新狀態，不建立或換綁會員，不套用蒸足文字指令。一般聊天／機器人功能未新增。
- 獨立 LIFF 的課程／方案提醒返回本店 LIFF，登入後保留日期與 plans/bookings 模式；不接受外部 next 或另一店 slug。未配置獨立 LINE 的既有網址格式保留。
- `COURSE_TRIAL_ORIGIN` 支援固定 HTTPS origin，拒絕帳密、path、query/hash；只調整課程對外連結，不改蒸足／SPA base URL。
- 新 COURSE 建店不建立有期限試用。HQ 確認 LIFF 驗收、入口／通道完整後啟用固定 30 天。訂閱鎖內檢查既有日期、訂閱及 TRIAL_STARTED，重送拒絕、不延長；保留操作者與驗收註記。Steamfoot／SPA 原試用政策保留。
- 準備期不開跨店／HQ 功能；最多 3 位人員與其餘原額度保留。既有店期限沒有重設。

## 設定方式（尚未套用）

透過受保護的 server deployment 環境變數提供 JSON 陣列，每項欄位：
`storeId, slug, identityMode(PROVIDER 或 CENTRAL), providerId, loginChannelId, messagingProviderId, messagingChannelId, liffId, basicId, destination, accessTokenEnv, channelSecretEnv`。

金鑰本身只置於被引用的 server secret，不放對話、Git、NEXT_PUBLIC 或 next.config.env。Login／Messaging 必須在同 Provider；實際歸屬由管理者 Console 核對，不以填入的值當作已驗證管理權。不同 Provider 不共用 raw subject 授權。

首店教練優先透過本店 LINE 完成會員身分，再由有權限店長「加入為教練」，沿用既有固定帳號連結。已存在但衝突的會員／教練不能只靠同電話換綁，仍需身分確認。

## 外部作業與固定試用環境

目前使用者只需首店名稱、店長信箱、是否已有官方 LINE／其他串接。管理者登入後再協助核對 Provider、channel 及必要權限。

收到資料後集中提交變更單，未核准不執行：

1. 首店隔離 LIFF 的精確 channel／endpoint、Messaging API／OA、既有 webhook／選單／登入依賴及預計變更；不覆蓋原服務。
2. 固定試用 host、Vercel project／鎖定版本、獨立資料環境 project／來源、費用與回復方式。現工程 branch alias 仍每日更新，不能直接當固定店家試用站；固定部署也不能共用可任意遷移的工程資料庫。
3. 指定收件人、訊息／Flex 原文、數量、觸發方式，獲准後才真實外發。原三則不重送。

現階段無新 migration 需要授權；不以新增正式店家或改正式資料庫補足測試。

## 驗收界線

本機型別及修改檔 lint、完整測試與新 PostgreSQL 並行開通測試的實際結果，於部署驗收後追加。LINE 程式測試／fixture 不算實機通過。

中央實機登入／三則純文字證據沿用。独立店通道、真實事件／Flex／按鈕、首店教練身分、固定試用環境仍待具體設定與實機配合。不宣稱已可批次交付其他店，仍無正式發布授權。
