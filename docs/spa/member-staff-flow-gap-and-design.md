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

## 上線與回滾

- schema 只新增 relation table 與索引，不改 legacy Booking／Transaction／Treatment。
- code deploy 前先套 additive migration；舊程式不讀新表，可安全並存。
- 若新入口失敗，回滾應用程式即可；保留 relation 與所有歷史資料，不 drop table。
- 正式資料 migration、合併與部署須在 Preview 驗收結果明確後另行確認。
