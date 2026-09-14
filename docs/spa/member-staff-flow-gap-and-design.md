# SPA 會員、服務人員與店長三端流程

狀態：主要版面方向已確認；第二階段程式、測試 DB additive migration 與一般瀏覽器 LINE Preview 流程已驗收。LINE App 內嵌 LIFF 尚待獨立實機驗收；此文件不是 Production 上線證明。

## 現況與具體缺口

| 範圍 | 現況 | 缺口與處理方向 |
|---|---|---|
| LINE 會員身分 | `CustomerIdentityLink` 已用 `userId + storeId + provider` 固定連到店內 Customer；LIFF exchange 會驗證 LINE subject | 保留為會員身分唯一來源，不以姓名或電話猜測，也不假設 LIFF 與一般 LINE Login 的 subject 可互換 |
| 帳號角色 | `User.role` 是單一全域角色；部分 LIFF resolver 只接受 `CUSTOMER` | 不再以全域 role 判斷「我的工作」。工作權限改由店別 staff link 判定；既有 OWNER／PARTNER 權限不被會員能力覆蓋 |
| 店內人員 | `Staff.userId @unique`，SPA 新增人員會建立不可登入的 SUSPENDED User | 保留既有 Staff 與它的 userId，不搬預約、排班或結算；新增獨立店別 `StaffMemberLink`，把真實會員 User 連到既有 Staff |
| 新增人員 | 店長手填姓名、電話，只建立排程人員 | 改為搜尋本店、未合併且具有效會員身分的 Customer；建立 Staff 後在同一交易建立 link，沿用會員姓名／電話 |
| 舊人員 | 沒有連結真實會員的流程 | 提供「連結會員」；只新增 link，不變更 Staff.id、既有預約、班表、技能或結算 |
| 停用 | 有未完成預約時直接拒絕停用 | 顯示待服務數量與改派入口；完成改派後停用 Staff 並撤銷 link。歷史與顧客會員資料保留 |
| 服務人員入口 | 另有手機＋密碼登入，且工作頁限制 Demo 店及 `PARTNER` role | 工作入口併入會員 LIFF／Web LINE 入口；每次讀取都重新驗證 active link、Staff 狀態與店別，不沿用電話或前端 cookie 授權 |
| 顧客 SPA 前台 | SPA 預覽是固定 Demo 身分；既有 member booking 是蒸足方案預約流程 | 新 SPA booking flow 使用該店 `SpaTreatment`、技能、人員、服務位置與排程 availability；寫入獨立 SpaBooking，不回接 legacy Booking |
| 三端更新 | 店長 SPA 排程已可讀寫，會員／人員仍未共用同一授權模型 | 三端使用相同 SpaBooking id；修改、取消、改派、完成後 revalidate 對應會員、工作與店長路徑 |

## 身分與權限模型

新增店別關聯 `StaffMemberLink`：

- `staffId + storeId` 唯一，確保一位營運人員只連一個會員帳號。
- `userId + storeId` 唯一，避免同店重複工作身分；同一 User 可在不同店有不同 link。
- foreign key 同時包含 `staffId + storeId`，不能把 A 店會員連到 B 店 Staff。
- link 保留 `linkedAt`、`revokedAt`、`linkedByUserId`，停用採撤銷而非刪除歷史。
- `CustomerIdentityLink` 證明「這個登入帳號是本店會員」；`StaffMemberLink` 才證明「這個會員可看本店工作」。兩者缺一不可。
- Staff 可接單仍另由 active 狀態、療程技能與班表決定；剛加入人員只開放工作入口，不自動成為可預約人員。

### 授權判定

```text
已驗證 LINE／LIFF session
  → CustomerIdentityLink 驗證本店會員
    → StaffMemberLink 驗證本店工作身分
      → Staff.status 驗證未停用
        → 僅查 storeId + staffId 對應的 SpaBooking
```

姓名、電話、前端角色切換與 store cookie 均不授予工作權限。

## 手機資訊架構

### 共用頂部

- 有雙重身分時顯示「會員專區／我的工作」切換；一般顧客不顯示。
- 切換只改變畫面，不更換或覆蓋會員身分。
- 上次選擇只保存顯示偏好；伺服器仍逐次驗證權限。

### 會員預約

- 第一屏先顯示下一次預約、方案堂數／期限、儲值餘額。
- 預約流程為「人數與服務 → 日期 → 時段 → 人員 → 確認」。
- 同行者各自選服務，共用主要聯絡人；送出前再次計算人員與服務位置。
- 我的預約以同行群組呈現，未來／歷史分開；月曆收在按鈕內。

### 我的工作

- 上方顯示完整月份月曆；預約日有藍點、休假日淡灰、今天有綠框，選取日為深綠底白字。
- 下方顯示選取日的預約筆數與全部行程，登入預設今天；月份可前後切換並可回到今天。
- 卡片第一行顯示時間、顧客與狀態，第二行顯示服務與服務位置；有備註時提供提示並可展開完整服務細節。
- 長空檔只顯示濃縮提示，不宣稱可接單。
- 第一階段唯讀，不提供完成、結帳、退款、改派或拆帳。

### 詳情

- 接近全螢幕的單欄內容；返回時保留原日期及捲動位置。
- 顧客只看可公開的服務資訊；內部 `serviceNote` 不可傳到會員端。
- 服務人員只看執行服務需要的資訊，不能看到錢包、退款或其他人員預約。

## 交付切片

1. 此缺口文件與 `/s/{store}/liff/service-flow-preview` 手機示意。
2. additive schema、會員搜尋、新增／連結／撤銷 staff link 與測試。
3. LIFF 雙重身分入口與唯讀工作查詢。
4. 真實 SPA 顧客預約、同行與方案資訊。
5. 三端更新、隔離／並行／回歸驗收及 Draft PR Preview。

## 2026-09-13 第二階段實作紀錄

- 新增 `StaffMemberLink`，保留舊 `Staff.id`、排班、預約與結算；測試 DB 僅套用 `20260913090000_add_staff_member_link`。
- 人員管理改為搜尋本店會員，顯示遮罩電話與 LINE 綁定狀態；新增、重送與舊人員連結均在店別鎖內處理。
- SPA 顧客詳情提供「加入服務人員」捷徑；服務資格與班表仍需另外設定，不因加入而自動接單。
- LIFF 登入可為既有 OWNER／PARTNER 建立 `CUSTOMER` 會員情境 session，不改寫資料庫角色；工作能力另由店別 link 判斷。
- 雙重身分會員顯示「會員專區／我的工作」，只保存畫面偏好；工作頁回到前景會重新驗證權限及抓取資料。
- 工作頁只查 `storeId + staffId` 的 `SpaBooking`，顯示顧客、服務、時間、服務位置與預約備註；不讀內部顧客備註、錢包或帳務。
- 停用前若有 PENDING／CONFIRMED 預約會阻擋並提示先改派；完成後停用會撤銷 link，顧客身分與歷史資料保留。
- 新表已啟用 RLS 並撤銷 `anon`／`authenticated` 直接表權限；應用程式只由 server Prisma 存取。

## 2026-09-13 Preview 操作驗收紀錄

- Preview 店長頁已以 `SPA 驗收店長` 登入，店別為 `spa-module-qa-20260903`。
- 「從本店會員加入人員」可搜尋本店會員，顯示遮罩手機與 LINE 綁定狀態；`SPA 測試顧客` 已從顧客詳情成功加入服務人員。
- 「連結既有人員」已把原 `驗收人員2・美容` 的既有 Staff 紀錄連到 `Spa測試員` 會員。資料庫核對顯示 Staff id 與 2026-09-12 的建立時間均保留；畫面名稱依會員資料更新為 `Spa測試員`。
- 測試 DB 核對只有兩筆有效 `StaffMemberLink`，兩筆均為 ACTIVE、未撤銷，沒有重複 link。
- 工作頁最初因 OAuth callback allowlist 只接受 `/s/{store}/book` 而回傳 `OAuthStoreContextLost`；`7fa77c2c` 已精確加入 `/s/{store}/liff/spa-work`，並保留同 origin、實際店別查詢與路徑 allowlist。新版 Preview 實測已能導向 LINE authorize。
- LINE authorize 目前回傳 `400 Invalid redirect_uri`：此 Preview branch alias 尚未登記在 LINE Developers 的 Web Login callback。依 `docs/deployment.md`，Preview OAuth 原本不在既有 callback allowlist；需由 LINE channel 管理員新增此固定 branch alias callback，或配置獨立 Preview LINE channel 後才能繼續真實 OAuth 驗收。
- 當時兩個可用驗收會員皆顯示 `LINE 未綁定`，因此此段只記錄為 blocker；後續真實 LINE OAuth 與一般瀏覽器畫面結果見下一節。不得用 server action、SQL 或偽造 cookie 冒充畫面驗收。

## 2026-09-13 LINE OAuth 與雙重身分續驗

- LINE Developers 已加入固定 branch Preview callback；一般瀏覽器以真實 LINE OAuth 完成登入，callback 正確回到 `spa-module-qa-20260903`，未再發生 `Invalid redirect_uri` 或店別 context 遺失。
- OAuth-only 會員補資料不再要求新增密碼；畫面不渲染密碼欄，後端亦忽略偽造表單夾帶的首次密碼。純手機登入與既有密碼修改規則保持不變。
- 指定 LINE 帳號與既有 `SPA 測試顧客（0900•••003）` 的安全整合已先執行 dry-run；結果無 blocker，只移轉該 Customer、phone identity link 與同店 StaffMemberLink。執行後舊測試登入 User 已停用、session 已清除，方案／預約／付款 fingerprint 未變，且寫入 `MERGE_CENTRAL_USER` audit。
- 中央會員整合已補齊 StaffMemberLink 移轉與同店不同 Staff 衝突阻擋，避免舊人員連結在帳號整合後失去工作權限。
- 最新 Preview 實際顯示「會員專區／我的工作」切換；會員頁可進工作頁，工作頁可回共用 `/book` 會員入口，一般瀏覽器不再被導到僅限 LINE client 的 `/liff` 邊界。
- 以獨立 `SpaBooking` 建立一筆可精確識別的驗收資料，瀏覽器工作頁正確顯示日期、10:00–11:00、顧客、全身芳療、床1、已預約及備註。資料庫核對後已刪除該筆本輪 fixture（remaining=0），保留既有會員、人員與連結。
- 尚未宣稱通過：LINE App 內嵌 LIFF 實機返回前景更新、不同 LINE 渠道 subject 對應，以及第三階段真實 SPA 顧客預約流程。

## 2026-09-13 我的工作月曆 Preview 驗收

- 提交 `764ec320` 的 Vercel Preview 已 Ready，並以固定 branch alias 完成以下實測。
- 以真實會員預約畫面建立 2026-09-16 10:00–11:00 的 SPA 測試預約；工作頁月曆顯示 1 筆預約藍點，選取後下方同步顯示顧客、全身芳療、床1與已預約狀態。
- 驗收備註加入後，精簡卡片顯示「有備註」提示；展開後顯示服務 60 分鐘與完整備註。畫面證據：[月曆與預約卡](evidence/spa-work-calendar-20260913.jpg)、[展開服務明細](evidence/spa-work-card-detail-20260913.jpg)。
- 以可精確識別的 2026-09-17 全日休假 fixture 驗證淡灰休假樣式、可點擊查看、「當日無預約」與「休假日」提示；沒有預約的正常排班日不會被誤判為休假。
- 上個月／下個月與「回到今天」均以瀏覽器操作通過；今天與選取日期樣式可同時辨識。
- 工作頁仍以 `storeId + staffId` 查詢獨立 `SpaBooking`，月曆預約點排除 `CANCELLED`，未讀取 legacy `Booking`、`Transaction` 或 `Treatment`。
- 同輪先前建立的 2026-09-15 預約已由會員畫面取消；DB 核對為 `CANCELLED` 且 `cancelledAt` 已寫入，取消歷史保留。
- 畫面驗收使用的 2026-09-16 預約及 2026-09-17 休假 fixture 均以固定 ID／booking ID 精確清理；清理後兩者 remaining count 均為 0，既有測試會員、人員、排班及取消歷史未刪除。
- 返回前景會沿用 `selectedDateRef` 重新驗證工作權限並更新同一選取日期；一般瀏覽器程式路徑已驗證。LINE App 內嵌 LIFF 從其他 App 返回的實機行為仍待手機驗收，未標記為通過。

## 2026-09-13 SPA Web LINE 返回修正驗收

- 手機舊版畫面證實登入由 `spa-module-qa-20260903` 發起，LINE 返回後卻顯示竹北品牌與一般登入錯誤。Vercel runtime 同時記錄 `InvalidCheck: state cookie was missing`；竹北店名是 `/entry` 未登入 fallback，不是帳號被授予竹北權限。
- `7b20bb60` 將 HTTPS 上的 Auth.js state 與 DB 驗證後店別 handoff cookie 改為 `SameSite=None; Secure`，並複製 Auth.js response headers 後追加 cookie，避免 immutable response 或跨站內嵌返回遺失 state。一般登入頁不再由 JavaScript 自行寫入店別 cookie。
- 同一提交讓 `/entry?error=...` 優先返回 DB 驗證後的 OAuth 店別；以隔離 cookie jar 故意送出無效 callback，結果為 `/s/spa-module-qa-20260903/?error=Configuration`，未再誤導到 `zhubei`。
- Preview deployment `dpl_EZN2pmJexDhLCd62VjKvmP9adop4` Ready 後，以真實 LINE 帳號完成瀏覽器登入。Callback 為 302，runtime 記錄同店 `oauth_linked_existing`，storeId 為 `store-spa-module-qa-20260903`、Customer 為 `spa-module-qa-customer-0900000003`。
- 畫面返回精確路徑 `/s/spa-module-qa-20260903/liff/spa-work`，顯示「SPA 空白模組驗收店」、「我的工作」及「SPA 測試顧客」，無紅字、無竹北品牌。工作頁可切到會員專區，會員頁顯示中央帳號「黃彥陸」、目前門市仍為 SPA 驗收店，且可再切回工作頁；兩次切換均無 console error。
- 驗收當日與 2026-09-12 均為 0 筆工作預約，因此本輪只確認真實空白狀態，不以它重複宣稱預約卡資料通過；預約卡、藍點與清理證據沿用上一節未受登入修正影響的 `764ec320` 驗收。
- 本輪沒有 migration、會員綁定寫入或店家資料修改。LINE App 內嵌 LIFF 從其他 App 返回前景後保留日期並刷新資料，仍需獨立實機驗收，未標記通過。

## 上線與回滾

- schema 只新增 relation table 與索引，不改 legacy Booking／Transaction／Treatment。
- code deploy 前先套 additive migration；舊程式不讀新表，可安全並存。
- 若新入口失敗，回滾應用程式即可；保留 relation 與所有歷史資料，不 drop table。
- 正式資料 migration、合併與部署須在 Preview 驗收結果明確後另行確認。

## 2026-09-14 SPA 會員預約與療程讀取鏈

- SPA 會員首頁與「我的預約」改讀獨立 `SpaBooking`；首頁下一筆與明細使用同一 server projection，狀態只取 `SpaBooking.status`，並補齊服務、人員、服務位置與結束時間。
- SPA 會員首頁與「我的療程」改讀獨立 `SpaEntitlement`；首頁與明細使用同一批 active projection。剩餘次數以 `remainingUses` 為準，尚可預約次數再扣除 `SpaEntitlementUse.RESERVED`，到期日以 `expiryDate` 的 date-only 值呈現。
- `EXHAUSTED`、`VOIDED` 與 `EXPIRED` 均在顧客畫面 fail closed，不會被誤列為可用療程；SPA 頁不再顯示會寫入 legacy 方案錢包的購買入口。
- 每次 action 都由網址解析實際店別，驗證該店為 SPA，再以固定中央會員關聯解析同店 Customer；不接受 client 傳入 storeId 或 customerId。`SpaBooking`／`SpaEntitlement` 查詢同時包含 `storeId + customerId`。
- 蒸足仍走原 `fetchLiffBookings`、`fetchLiffWallets`、legacy 取消與會員預約流程；本次沒有 schema、migration 或資料寫入。
- LIFF 新店解析補上 `Store.liffId` 優先路徑。已在中央 LIFF 對照表中的三家蒸足店保持原固定 ID；其他新店可在測試 DB 設定自己的 LIFF app，不再被全域 fallback 蓋過。

### 測試店獨立 LIFF 一次性設定

1. 在目前中央會員使用的 LINE Login channel 內新增一個 LIFF app（獨立 LIFF app，不另建 LINE Login channel，否則 OIDC `sub`／`aud` 會改變而需另做跨渠道身分遷移）。
2. LIFF app 設為 Full，Endpoint URL 填固定 Preview alias：`https://steamfoot-booking-git-codex-spa-b1b96e-rock7652-2111s-projects.vercel.app/s/spa-module-qa-20260903/liff`。
3. Scopes 勾選 `openid`、`profile`；不要求 `email`，也不啟用外部瀏覽器模式。
4. 將產生的 LIFF ID 寫入測試 DB 該店 `Store.liffId`；只改 `store-spa-module-qa-20260903`，不改三家正式店。
5. 若同時驗一般瀏覽器 LINE OAuth，在同一 LINE Login channel 登記 `https://steamfoot-booking-git-codex-spa-b1b96e-rock7652-2111s-projects.vercel.app/api/auth/callback/line`。LIFF SDK 本身使用上一步 Endpoint URL，不以 callback URL 取代。
6. Preview runtime 的 `CENTRAL_MEMBER_LINE_LOGIN_CHANNEL_ID` 必須等於該 LIFF app 所屬 channel ID；若沿用目前中央會員 channel 不需改值。不得把 channel secret、access token 或使用者 token 寫進 DB、PR 或對話。
7. 設定後以 `https://liff.line.me/{LIFF_ID}` 從手機 LINE 開啟，依序驗入口店名、會員／工作切換、我的預約、我的療程，以及切到其他 App 返回後保留日期並刷新資料。

## 2026-09-14 SPA 會員預約、占用與取消 Preview 驗收

- Draft PR #1001 的固定 Preview alias 已部署 `ab2f3b53`；Vercel check 為 Ready。Cloudflare Workers check 仍失敗，依本期範圍不處理，也沒有合併或部署 Production。
- 以真實會員畫面在 `spa-module-qa-20260903` 建立 2026-09-17 10:00–11:00 的全身芳療，指定 `SPA 測試顧客` 與 `床1`。會員首頁、我的預約及人員工作月曆均顯示同一筆確認中預約。
- 建立後，方案仍為 2 / 2 堂、待到店為 1、尚可預約為 1；證實只建立 `RESERVED` 占用，沒有提前扣次或重複扣次。同一人員與位置的 10:00 時段不再出現在可選清單。
- 第一次取消後，預約保留在歷史並標示已取消，會員首頁回到 0 筆、工作月曆移除 9/17 藍點，方案回到 2 / 2 堂且尚可預約 2；原 10:00 時段重新可選。
- 隨即以相同服務、人員、位置與時段重新預約成功；會員與人員端再次同步，方案占用再次正確為 1。完成核對後第二次取消，最終 10:00 時段再次開放、工作頁為 0 筆、方案為 2 / 2 且待到店為 0。
- 本輪只留下兩筆可追溯的 `CANCELLED` 預約歷史及其已釋放占用紀錄，未刪除既有會員、StaffMemberLink、療程、排班或其他測試資料；沒有 legacy `Booking`／`Transaction`／`Treatment` 寫入。
- 全套 Vitest 結果為 484 個檔案通過、3 個跳過；4,340 項通過、32 項跳過。店長排程的既有登入版本亦顯示測試人員 10:00 為可新增狀態；本次變更不修改店長排程查詢鏈。

## 2026-09-14 LINE App 返回前景更新實機驗收

- 固定 Preview alias 已包含 `091e0fda` 的 LIFF resume refresh 修正，以及與最新主分支整合後的 `948e7abf`；本輪未重跑先前已通過且未受影響的資料庫測試。
- 手機 LINE App 的「我的工作」先選取非今天的 2026-09-17，再切換至其他 App；切換期間由桌面會員畫面建立 2026-09-17 10:00–11:00 的全身芳療測試預約，指定 `SPA 測試顧客` 與 `床1`。
- 建立畫面回報「預約成功」，會員端顯示同筆 `CONFIRMED` 預約。返回手機 LINE App 後，驗收者確認選取日期仍停在 2026-09-17，沒有跳回今天，且 10:00–11:00 預約不需手動重新整理即自動出現。
- 因此 LIFF `pageshow`／`focus`／`visibilitychange` 返回前景更新與選取日期保留，已完成真實 LINE App 實機驗收；桌面瀏覽器結果未被用來替代此項實機證據。
- 本節建立的測試預約需在保留上述結果後精確取消；取消屬另一項具副作用操作，須另取得執行時確認。既有會員、人員、排班、取消歷史及其他測試資料均不得刪除。

## PR #1001 合併前部署條件

- PR 程式與 Preview 驗收已涵蓋會員加入／連結人員、雙重身分、SPA 會員預約與療程讀取、三端同步，以及 LINE App 返回前景更新；PR 仍維持 Draft，未合併、未部署 Production。
- 正式部署前必須先安全套用 additive migration `prisma/migrations/20260913090000_add_staff_member_link/migration.sql`。目前 `scripts/ci-migrate.mjs` 的 Production allowlist 尚未包含此 migration，因此在補齊可審查的部署機制前不得直接上線。
- Production 的 `DATABASE_URL` 與 `DIRECT_URL` 必須同時核對為正式資料庫，且 `NEXTAUTH_URL`、穩定的 `NEXTAUTH_SECRET`、LINE Login callback 與各 SPA 店 `Store.liffId` 必須在同一待上線版本完成檢查；不得沿用 Preview 測試 DB 或測試店設定。
- 建議部署順序為 migration → 應用程式 → 真實店型 smoke test → HQ 啟用。回滾時只回滾應用程式，保留新增 relation table 與歷史資料，不刪表、不回退 legacy 資料。
