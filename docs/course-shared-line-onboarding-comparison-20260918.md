# 蒸足與課程：共用開店／LINE／LIFF 流程對照

依現有原始碼與既有發布／驗收紀錄核對；未重新讀正式庫或 LINE Console，不能把程式設定當作目前 Console 實機驗收。首店資料及機密不寫入公開文件。

## 1. 蒸足現行流程

1. HQ `/hq/dashboard/stores/new` → `createStoreAction`：查 slug／email／domain 重複，在交易中建立 Store、ShopConfig、OWNER／Staff、權限與模組資料，產出會員、註冊、後台網址。這不是 LINE API 開通程序。
2. HQ 可填 `lineDestination`（bot user ID），店家設定可填 `ShopConfig.lineOfficialUrl`（加好友／聯絡連結）。**兩個欄位都不等於 Login channel、LIFF 或 token 已配置。**
3. 管理者在 LINE Developers 選擇可沿用的 Provider／Login channel，手動建立或使用 LIFF，endpoint 對應 `/s/<slug>/liff`，再登錄 LIFF ID。`docs/liff-setup.md` 是早期 MVP 文件，其中「日後每店 channel」是當時計畫，不能當成今天既定規則。
4. 當前 `central-member-config.ts` 明確列出三家蒸足共用 Login channel 2010761154，各店不同 LIFF app。web OAuth 由 WEB_LINE_LOGIN_CHANNEL_ID／SECRET 配置；LIFF 驗證則用 central-member channel。`docs/central-web-line-login-rollout.md` 記載目前中央網頁整合，不能混用 Messaging secret。
5. LIFF ID 使用既有 Store.liffId／明確店別對照／歷史環境設定，由 store-resolver 與 LiffShell 處理。舊店已有 backfill 腳本；目前 HQ 並沒有完整的 LIFF 建立／登錄表單，也未找到呼叫 LINE LIFF 建立 API 的開店程式。
6. Messaging 使用各店官方帳號的 token／secret；`line-config.ts` 原有竹北／新竹／台中固定對照。Webhook 依 destination 找店、驗簽，再處理會員綁定／訊息。提醒有本店與中央路由，經 verified-reminder-line-route 核對可接收身分；不能把中央 Login 相容等同任意 OA 都能收訊。

## 2. 逐項對照

|步驟|蒸足來源|課程目前|分類／必要處理|
|---|---|---|---|
|HQ 建店與帳號|new-store-form、store-onboarding|同一表單與 action，選 COURSE|已共用；保留不同模組資料模型|
|權限與訂閱|StaffPermission、single-store-trial|同一權限與訂閱服务；課程交付後起算|已共用，課程保留教練前台與防重送|
|官方 LINE 分享連結|ShopConfig.lineOfficialUrl、付款／店家設定|同一欄位與成熟元件|每店填值；不代表登入或發訊已開通|
|LIFF ID／入口|Store.liffId、store-resolver、LiffShell|共用同一資料及元件|Console 建立／沿用及登錄是每店配置；完整 HQ 登錄介面仍缺|
|登入驗證|exchange、Credentials、verified-line-customer|同入口增加 server channel context|中央相容店不必另建 channel；独立 Provider 才需隔離 namespace|
|網頁登入|OAuthButtons／Auth.js|同一按鈕與 provider；87f7ee9d 只對指定 cohort 走 LIFF|不是另建登入系統；b3f5973f 過廣已修正|
|發訊憑證|line-config／line push|新 registry 接在同一 resolver／push|原三店寫死是平台限制；registry 讓新店只需配置，不逐店寫分支|
|Webhook|同一 `/api/line/webhook`|同入口驗本店 HMAC，COURSE 分派已驗證會員 follow/unfollow|共用接收與驗簽；不套蒸足交易／文字指令|
|提醒、Flex、紀錄|原模板 builder、MessageLog、verified route|共用模板、紀錄、發送；課程事件查 CourseBooking／卡片|共用介面與基礎服務、保留必要資料差異|
|通知連線檢查|line-official-accounts、StoreLineHealthCard|本次移除單店檢查的三店白名單，課程提醒頁重用原卡片|本次整合；仍檢查 active store、權限、功能額度；preview 不探測／發訊|

## 3. 新增實作是否重複

- e957552e 的 store-line-config 是原 line-config 的資料來源擴充，不是另一套發送或 LIFF 前台。b3f5973f 主要增加網頁按鈕分流與登入方式顯示，不是所有新增功能的起點。
- Provider namespace、audience／store context、獨立 bot 身分檢查補的是原中央／三店能力的邊界；若選擇既有中央架構，不必為了使用課程而新建 Provider／Login channel。
- 已發現可整合的遺漏：共用「單店官方 LINE 檢查」仍拒絕三家以外店家。現在直接重用此服務與原 UI，不新增課程專用檢查器。跨店總覽仍維持原三店範圍，沒有擴大 OWNER 可看其他店的範圍。
- 固定 pilot 環境是整批試用共用的一套部署／資料環境準備，不是每家店各建 Vercel／Supabase，更不是 LINE 開店必要步驟；不把此前新增資源提案當成本次既定要求。

## 4. 配置與仍缺的程式須分開

**每店配置**：slug／店長、官方 LINE、已確認 Provider／channel 歸屬、LIFF ID／endpoint、Messaging secret 的受保護設定、會員入口、指定對象驗收。可同 Provider／同 Login channel、多 LIFF；也可沿用店家既有 channel，按實際所有權與既有服務決定。不同 Provider 身分不能靠同名／電話合併。

**平台缺口**：HQ 尚缺完整非機密 LINE／LIFF 登錄與狀態檢查工作台；憑證仍由受保護部署設定提供，不能假稱貼 lin.ee 就已串接；新任意店的總覽需要另以 HQ 範圍呈現，不能直接擴大舊 OWNER 全店清單。Preview 真實事件／Flex 限定發送及實機驗收尚未完成。LINE Console 自動建立不是現有蒸足已完成能力，不納入「複製既有功能」冒充已完成。

本次未寫 Store.liffId／lineDestination，未變更 Provider、callback、webhook、選單或 token，未外發。尚未取得首店管理頁唯讀授權，沿用前次明確限制。

## 5. 同一套平台的後續開通清單

HQ 建店查重 → 選模組 → 核對可沿用 channel／既有用途 → 登錄 LINE／LIFF 與受保護憑證 → 顯示本店會員入口 → 驗證帳號、店別、角色 → 購買／預約／出席與通知返回 → 可用後啟用試用。

首店補齊共用登錄與檢查缺口後，後續 4–5 家使用相同程式，只新增設定與資料並驗收；不複製前台、不新增店名 switch、不預設重建 Provider。
