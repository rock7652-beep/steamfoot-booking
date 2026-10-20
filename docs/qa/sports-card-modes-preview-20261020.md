# 運動課卡模式隔離 Preview

僅建立功能分支 Preview；不合併 main、不正式部署、不操作正式顧客資料。功能與本機驗證見 `sports-card-modes-implementation-20261020.md`。

## 已確認目標

- Vercel team `team_IAPnhzLHM4x540wiXg3lTyS9`，專案 `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`（steamfoot-booking）。
- GitHub `rock7652-beep/steamfoot-booking`，分支 `fix/sports-item-and-universal-cards-20261020`，不更改正式網域。
- Supabase 僅操作 `ttworfzgwejdeolegkxl`（steamfoot-preview）。正式 `qijlnhtpbintanzpxkvf` 未執行 SQL 或 migration。
- 既有合成驗收店 `sports-live-flow-store`／`sports-live-flow` 存在；合成老闆及會員連結存在，沒有重設帳密或複製正式帳號。

## 欄位候選安裝

已在上述隔離專案成功套用單份 migration `sports_card_modes_entitlement_fields_20261020`。SQL 來源為 `scripts/sql/sports-entitlement-candidate.sql`，SHA-256：

`e4f8182d936036b519d44f50d16f11bd69d70840058562b77f8419ec7aa4ca33`

安裝後九個欄位與三個 validated CHECK 均存在。三張表維持 RLS；anon／authenticated 沒有 SELECT／INSERT／UPDATE／DELETE 存取。沒有授權新角色或執行其他 migration。

| 摘要 | 安裝前 | 安裝後 |
| --- | ---: | ---: |
| 課卡筆數 | 239 | 239 |
| remaining 合計 | 1326 | 1326 |
| 點數紀錄筆數 | 931 | 931 |
| 紀錄 points 合計 | 2459 | 2459 |
| 預約筆數 | 12919 | 12919 |

這是隔離環境摘要，不包含顧客明細，不能代替正式角色或正式 schema 驗證。

## 部署限制與增量驗收

新增精確分支 allowlist，沿用既有 sports Preview 守衛：只允許 Vercel preview、正確 repository、隔離 DATABASE_URL／DIRECT_URL 與明確兩個 sports opt-in；正式目標或錯誤連線立即拒絕。自動 migration 仍跳過，對外通知沿用 Preview 阻擋。守衛相關 4 檔 89 項測試通過。

部署已 READY，ID `dpl_FCrcD93wr5ikxA9rpiGjNgr8u9mc`，target 為 Preview（API target=null），框架 Next.js 16.2.2，建置約 3 分 37 秒。

- 提交：`ad43c5d8e42ff00890c4275296308491ca9b3e09`，與遠端功能分支一致。
- Preview：`https://steamfoot-booking-pbgx080h8-rock7652-2111s-projects.vercel.app`。
- 後台：`/hq/login?store=sports-live-flow`；會員：`/s/sports-live-flow/book`。
- 建置日誌確認 `[sports-redesign-preview] isolated_database=true migrations_skipped=true notifications_blocked=true`，編譯與建置型別檢查成功。
- 隔離 migration history 版本：`20261019234358`；未補跑其他 migration。
- 只為本分支新增 Preview 範圍的 SPORTS_REDESIGN_STAGING=1、SPORTS_REDESIGN_PREVIEW=1、AUTH_TRUST_HOST=true；未讀出、替換或變更正式憑證。
- Draft PR：`https://github.com/rock7652-beep/steamfoot-booking/pull/1366`，未合併。

READY 後兩個入口的只讀 HTTP 檢查皆為 302 至 `vercel.com/sso-api`。此前建置期間的 200 是 Vercel 建置占位頁，未列為應用程式健康或登入證據。SSO 保護沒有停用，亦未索取 bypass secret。

目前重新搜尋可用工具，仍沒有 Browser `js` 或 CUA 瀏覽器工具；沒有宣稱已連接或登入。已詢問是否能在具備瀏覽器的工作階段接續，部署與資料庫工作不因此停止。

待驗後台 1440×900、iPad 1024×768／768×1024、會員手機 390×844 與面板 360px。依需求基準只補項目規則、兩種方案、無方案選單排課、報名、固定課點名、扣還點、更正及角色顯示。登入／尺寸驗收未完成，不以先前 238 項本機測試或本次 migration 成功代稱完整交付。

最小補驗順序：合成老闆登入 → 同項目建立兩種指定方案及通用卡 → 設定兩個項目的教練與開放課扣點 → 指定課不選方案排課、點名依各自購入規則扣抵 → 合成會員以同卡報名兩項開放課 → 阻擋兩種權益混用 → 取消／更正與重送核對原數量 → 檢查三種尺寸的操作、返回與角色顯示。只新增本輪合成測試資料，不重設既有驗收資料。

## CI 補充

首次完整 CI 的 25 個失敗集中於兩份既有測試的課卡欄位及查詢 mock 缺漏；補齊 unit、templateIds、requestKey、到期日及教學項目查詢後，兩檔 57 項回歸均通過。此次只修測試資料，不變更已部署的業務程式。提交 `86b249467dff111ae4e194335eaeb9b6fdfcd53e` 的完整 CI [39344492982](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/39344492982) 已通過：1133 檔、11136 項通過；18 檔、141 項跳過。Typecheck、指定測試與 ESLint 通過。運動共用卡隔離 PostgreSQL（39344493056）與音樂補課隔離資料庫（39344493010）亦通過。此提交與 Preview `ad43c5d8` 之間僅有兩份測試與兩份 QA 紀錄差異。桌機、iPad 及會員手機登入後操作仍未驗收，交付判定維持待驗收。

## 2026-10-20 人工增量與排課密度修正

使用者於正確 Preview，以合成「驗收老闆」提供畫面。通用卡「QA-通用卡-1020」新增後清單及重新開啟編輯均顯示 OPEN、10 點、100 元、90 天；通用卡主要表單未顯示教學項目、教練及每堂扣抵欄位。此證據限畫面新增／回讀，不列為購買或扣點通過。

QA-課程 A、B 已出現在教學項目與 2026-10-20 課表，教練為驗收老闆；A 編輯畫面可見每堂扣點 2。B 的扣點、兩堂選課模式與會員權益尚未核對。沒有以清單推定交易通過。

使用者指出編輯單堂排課過長。最小修正只套用運動原生課表的單堂編輯：保留 RightSheet、欄位、儲存及未儲存保護，以實際容器寬 560px 切換六欄網格。課程項目／名稱各半列；修改範圍／日期／開始時間三欄；教練／時長／人數三欄；扣點／空間各半列。保留原字級、44px 輸入與固定操作列，視窗依內容高度收合。窄容器、低高度、長文字及預約警告仍可捲動，不裁掉內容；不將強制隱藏捲軸當成解法。

本輪型別與 ESLint 通過，沿用課表、表單及 RightSheet 相關回歸；未另新增僅核對 CSS 字串的測試。新增密度版本的實際桌機、iPad 橫直向及 360px 容器尚待可操作瀏覽器或人工補驗，不宣稱已達免捲動。此調整不修改交易或 schema。

### 自動課名尾碼

`QA-課程A-1020 · 7bd42a` 的尾碼來自內部 sports_item／sports_rule 模板 ID，用於內部同名區分。新增共用呈現函式：只有當模板 ID 符合運動自動模板格式，且課名最後六碼與該 ID 完全相符時才隱藏尾碼。既有課表初次載入、背景刷新、編輯入口、會員選課／預約及授課頁共用判斷；新建立或複製排課也使用乾淨快照。保留模板 ID、模板內部名稱、既有歷史快照與財務欄位，不執行批次改名或 migration。非運動課、自訂名稱、不相符的十六進位尾碼與名稱中段內容保留。

密度版本 8563ab5c 的 CI 39347837669 與隔離 Preview cx77udu03 已通過建置；新增尾碼修正後將另建兩項合併的隔離 Preview。尾碼修正 TypeScript、ESLint 及 6 檔 37 項相關回歸通過。React 檢查：不新增請求或逐筆查詢，不引入 client state／effect，不更動業務授權與傳輸範圍。實際登入畫面與觸控仍待補驗。

### 密度與課名合併版部署結果

- 提交：`fcbd486e5ffae1853316e8e156b501b7959ea64e`。
- Preview READY：`https://steamfoot-booking-3mtg3ixg6-rock7652-2111s-projects.vercel.app`，部署 ID `dpl_Axj6FjSWhXFHGVrmQ8yA9E9v3TZU`。API target=null（Preview），來源 SHA 已核對。
- 建置日誌確認 `isolated_database=true migrations_skipped=true notifications_blocked=true`；編譯與建置通過，未改動資料庫或正式站。
- [完整 CI 39348365607](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/39348365607)：1133 檔、11139 項通過；18 檔、141 項跳過。Typecheck、指定測試、ESLint 全通過；運動隔離 PostgreSQL 39348365550 與音樂隔離資料庫 39348365559 通過。
- 桌機／iPad 實際免捲動、窄容器、會員手機與登入交易仍待補驗；不得沿用舊 Preview 畫面判定本版本視覺通過。舊部署不可變，需開啟新網址核對。

### 自訂課名收合（2026-10-20）

使用者回報尾碼已移除，接續要求把重複課名收合。運動單堂編輯的主要欄位改稱「教學項目」，課名改為預設關閉的「自訂課名（選填）」。沒有自訂值時沿用目前所選教學項目；已有自訂值在摘要顯示並保留，清空恢復自動名稱。切換教學項目不卸載輸入、不清掉自訂草稿。原有後端名稱必填與授權、排課及扣抵規則保留；表單以隱藏欄位提交完整名稱，不新增空白名稱例外。新增運動排課原本即不要求填課名，維持既有流程。

保留同一 RightSheet 與未儲存保護，依實際容器寬度排列選填展開入口，字級與 44px 操作尺寸保留。React 檢查未新增請求／effect；只有自訂草稿使用元件狀態，項目預設名直接由 props 推導。TypeScript、變更 ESLint 及 4 檔 16 項相關測試通過，其中 3 項實際表單測試涵蓋自動沿用／切換項目、既有自訂名保留、清空恢復。這些是 DOM 與提交值證據，非桌機／iPad 視覺或登入交易驗收。新版 Preview 與最新 CI 以 PR 結果為準。

選填課名版本 `8855b6bc88259135d9f651473adb2184b83e7a41` 已部署 READY：`https://steamfoot-booking-e07kf7iji-rock7652-2111s-projects.vercel.app`，部署 ID `dpl_4MdfouUHggjJ15BbmUDeT7MQpyxq`（Preview，API target=null），來源 SHA 已核對。建置守衛確認隔離庫、略過 migration、通知阻擋。完整 CI [39350170674](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/39350170674) 通過：1134 檔／11142 項通過，18 檔／141 項跳過；Typecheck、指定測試與 ESLint 全通過。運動隔離 PostgreSQL 39350170516 與音樂隔離資料庫 39350170532 通過。未合併或正式部署，新版實際桌機／iPad 畫面與會員交易仍待補驗。

使用者於上述新版發布後回覆「好 pass 下一步」，本輪記為自訂課名收合的人工確認；未附裝置尺寸與交易結果，不擴張為 iPad／會員或扣抵驗收。接續待驗同一合成會員持有 QA-通用卡-1020 的起始 10 點、A／B 報名保留與點名實扣。

### 方案頁購買入口誤停用

使用者在 e07kf7iji 的「顧客持有方案」回報購買按鈕反白。原因：member-page 僅在 customers 分頁載入分頁顧客；plans 分頁刻意不預載 people，購買表單另有 CourseCustomerPicker 與授權查詢，但入口還檢查 !people.length，造成固定誤停用。最小修正僅讓顧客頁保留原名單檢查，方案頁依購買權限及有效方案開啟；不補載整店個資，不移除顧客選擇必填或交易檢查。共用方案入口適用運動及音樂，各自方案單位規則保留。

3 檔 34 項相關測試通過，包括新增運動／音樂在 people=[] 時可開啟真實購買表單、顧客未選擇仍無法通過表單驗證、沒有上架方案維持停用、無購買權限不顯示入口。變更 ESLint 與 TypeScript 通過，沒有執行結帳或變更任何雲端資料。實際 Preview 購買流程仍需接續補驗。

購買入口修正版 `be74e732ea607222ade3874da2a75270d4744aa4` 的 Preview 已 READY：`https://steamfoot-booking-gguzkqfy6-rock7652-2111s-projects.vercel.app`，部署 ID `dpl_6Duz7dq2bT41KwLzy5piak8avLG9`（Preview），來源 SHA 核對一致，守衛確認隔離庫、略過 migration、通知阻擋。完整 CI [39352046498](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/39352046498) 通過：1134 檔／11146 項通過，18 檔／141 項跳過；Typecheck、指定測試、ESLint 與運動／音樂隔離資料庫 CI（39352046512／39352046500）通過。實際購買及扣抵仍待使用者在新版補驗，未合併或正式部署。原 A 課 2026-10-20 09:00 已開始，會員自行報名需改用未來可預約課次，不能將時間限制誤判為權益失敗。

### 人工購買成功與起始額度（2026-10-20 台北時間約 09:20）

使用者在 gguzkqfy6 修正版提供畫面：方案頁購買入口可開啟，合成顧客可搜尋並選取；現金方式因當日抽屜未開而禁止送出，畫面提供開抽屜與重新確認入口。使用者接續完成隔離開抽屜及購買，畫面出現「結帳完成，方案已加入」。新增「QA-通用卡-1020」持有人為合成「運動驗收學員」，剩餘 10 點、已預約 0 點、可用 10 點，有效至 2027-01-17。此項記為人工後台購買與清單起始額度通過；未以截圖推定資料庫快照、會員購買入口或點名實扣通過。

接續同卡跨項目報名：A 原課次 2026-10-20 09:00 已開始，先調至未來可預約且不撞期時段；確認 A 2 點、B 3 點，使用同一合成會員報名。預期尚未點名時 remaining 保持 10，保留合計 5，可用 5；點名實扣與取消／更正另驗，不混淆保留與實扣。

### B 課會員報名與保留額度（2026-10-20 台北時間約 09:27）

使用者提供會員頁畫面，10/21 15:00 QA-課程B-1020 顯示「已預約」、剩 7 位。此為 Mac 上的窄版會員介面截圖，不列為實體手機觸控驗收。

僅在隔離專案、指定合成顧客及新通用卡做唯讀核對：卡 `cmvfzyf3m0001l6087462b42p` 為 OPEN／POINT，remaining=10、RESERVED 保留合計=3、DEBIT 明細數=0，可用 7。預約 `cmvg074ow0001l607l23017er` 為 RESERVED、pointCost=3，operatorUserId 符合合成會員本人；課次 `cmvfxpe0l0001jq086qfp6pkt` 為 B、快照 3 點、開始時間 2026-10-21 15:00（Asia/Taipei）。未寫入資料、未用 SQL 代建預約或操作正式庫。

本項可記為合成會員登入後報名 B 及保留 3 點通過；尚未點名實扣。會員單張卡顯示待截圖核對；A 跨項目、取消／更正、指定學員方案及 iPad／實機手機仍待補驗。既有其他卡有獨立額度，不以會員全部方案合計取代這張 QA 卡的 10／3／7 證據。


### 已授權批次 API 補驗（2026-10-20，gguzkqfy6／be74e732）

本節更新前述待驗項目的狀態。使用者的會員「我的方案」截圖已確認單卡 10／3／7。使用者另明確授權僅對 gguzkqfy6 取得臨時 Vercel 存取連結；連結限該部署並有到期時間，未修改專案或正式站保護。透過 Auth.js CSRF／credentials 正常登入合成 OWNER 與 CUSTOMER；未偽造 session、讀出密碼雜湊或重設密碼。工具沒有可用 Browser／CUA，因此本輪為正常 HTTP Server Action 業務驗收，不是裝置視覺驗收。

共 34 次應用 API 呼叫：30 次取得 success:true；4 次為預期的角色或權益拒絕。每次核對明確業務回傳，不以 HTTP 200 代表成功。交易全部經應用 API 執行，SQL 僅在隔離庫 ttworfzgwejdeolegkxl、sports-live-flow-store 及指定合成課卡／課次做唯讀驗證。無正式庫、真實顧客、程式修改、合併或正式部署。

| 增量案例 | 實際結果 |
| --- | --- |
| 未來 A 課 | 原已開始 A 保留；另建 10/21 11:00–12:00（Asia/Taipei），教學項目 A、OPEN、2 點。重送相同 requestKey 回傳相同課次，僅一堂 |
| 同卡跨 A／B | 合成會員報名新 A；同一卡 A 2 點、B 3 點。remaining=10、reserved=5、available=5、DEBIT=0 |
| 報名重送 | 新 A 相同 requestKey 回傳相同預約 ID，未重複名額／保留 |
| 取消與重約 | 取消 A 及重送均成功；remaining=10、reserved=3、DEBIT=0。重約後恢復保留合計 5 |
| 開放課點名及重送 | 老闆逐堂 A、B 點名，各重送一次；僅各一筆 DEBIT 2／3，remaining=5、reserved=0 |
| 開放課更正及重送 | A、B 更正回 RESERVED，各重送一次；按原 2／3 還點，remaining=10、reserved=5、available=5。帳本保留原扣點及更正紀錄 |
| 指定方案與購買 | A 項目建立 10 點／每次 2 點及 10 堂／每次 1 堂兩方案，以兩位既有合成學員做零元測試結帳。各重送一次，各僅一張卡及一筆 CONFIRMED 訂單 |
| 購入快照 | 點數方案售後改為每次 4 點，已成交訂單及課卡仍為 2 點，堂數卡仍為 1 堂 |
| 固定課排課 | 10/22 11:00–12:00 週固定指定兩位學員，payload 無 fee／課卡選擇。初始皆 UNPAID、cardId=null、pointCost=0；未預扣或保留 |
| 固定課自動選卡／重送 | 點名自動選各學員 A 項目卡，各扣原購入 2 點／1 堂，餘額 8／9。各重送一次，每位僅一筆 DEBIT |
| 固定課更正／重送 | 整批回到 RESERVED 並重送，按原數量還點；兩卡皆回到 10，預約恢復 UNPAID／cardId=null／cost=0 |
| 權益與角色 | 指定項目卡支付開放課、通用卡支付指定課均拒絕。會員以 member:true 點名及省略 member 轉走管理操作均拒絕，未改預約狀態 |

對照 ID：未來 A 課 cmvg0q9wq0000jk08g1my3s3b；取消 A 預約 cmvg0qrsg0002jk08vcflmxnb；重約 A cmvg0sfb60008jk08r3wvsf73；B 沿用 cmvg074ow0001l607l23017er。固定指定課 cmvg0v6dm000rjk08p2sqnqar；點數卡 cmvg0uwyn000kjk08gxz6vxhk；堂數卡 cmvg0v1fk000ojk08tpg1et4i。完整不含憑證的 API 回傳與資料庫階段快照見 sports-card-modes-api-evidence-20261020.json。

最後保留供人工驗收的狀態：通用卡剩餘 10、保留 5、可用 5，A／B 均待點名；兩張指定卡皆剩 10，固定課兩位學員均待點名且不占卡額度。QA 指定點數方案目前扣抵規則每次 4 點，其既有測試購入卡仍為 2 點，這是快照驗證刻意保留的差異。

已再次核對 be74e732 的完整 CI 39352046498、運動隔離 PostgreSQL 39352046512、音樂隔離資料庫 39352046500 全部 success；無業務程式變更，不重跑整套。既有真實 PostgreSQL 的不足／到期選卡、批次回退、名額競爭及其他未改行為沿用原證據，未宣稱此次 Preview 重跑。

交付判定：兩種模式的本輪登入後核心交易增量通過；仍缺桌機 1440×900、iPad 1024×768／768×1024、會員手機 390×844、窄面板 360px 的實際呈現與觸控／返回／草稿操作。OWNER／CUSTOMER API 權限通過不擴張為所有非店長教練角色完整驗收。PR 保持 Draft，尚不宣稱完整交付或正式站已更新。


### TinyFish 登入後 HQ 預覽增量（2026-10-20）

使用者親自以 Staging Admin／總部登入並保存 TinyFish profile，後續完成四輪瀏覽器操作；只查看 sports-live-flow 隔離店與合成會員，未重跑購買、報名、取消、點名或扣還點，未送出業務儲存、改程式、合併或部署。

可採用的有限結果：桌機 1440×900 預覽可編輯未來 A、顯示乾淨課名及欄位、關閉回原課表；平板橫向 1024×768 的指定／通用卡必要欄位切換正確；平板直向 768×1024 主要表單與操作可達，兩個同尺寸表單的草稿均在展開收合後保留。手機 390×844 外框可進入合成會員預覽並顯示底部導覽及我的方案入口，但深層單卡展開仍未完整驗證。桌機瀏覽器的會員唯讀頁另確認單卡 10／5／5、本店開放選課及展開收合；不能拿它代稱手機結果。

仍缺三項：同一草稿在確實改變尺寸後的保留、關閉重開後的本地草稿、手機內層單卡展開。工具有尺寸／URL／按鈕回報矛盾，不能以其 conditional PASS 或 completed 狀態宣布通過；也未證實產品回歸。運動面板略過離開確認的分支在基準 8d717d5 即存在，useFormDraft 另保留本地草稿，不直接新增確認介面或宣稱資料遺失。

預覽尺寸採 HQ preset，未獨立量測 innerWidth／scrollWidth，不是實機觸控／鍵盤／安全區驗收。捕捉設定已開啟，但工具未回傳可下載截圖 URL，本對話沒有影像檔逐張複核。完整原始回報、步驟及校正理由見 sports-card-modes-device-evidence-20261020.json；人可讀的結果、四個 run 連結及最小未驗清單見 sports-card-modes-device-acceptance-20261020.md。

本輪只有驗收紀錄變更，沿用 be74e732 已通過的完整 CI 與兩套隔離資料庫 CI，不重跑。PR 維持 Draft，完整裝置驗收尚未完成。


### 三種裝置預覽與人工第 3 項確認（2026-10-20）

依使用者要求，HQ 裝置預覽與隔離前台尺寸工具共用手機 390×844／平板 1024×768／桌機 1440×900，移除獨立平板直向選項；舊 tabletPortrait URL 沿用既有回退規則至平板。I08 後台指南同步改為三種尺寸。只調整預覽選項，沒有移除實際直向 RWD、修改扣抵邏輯或重跑交易。

使用者「3. 可以」及 HQ 截圖確認合成會員通用卡展開、10／5／5 與底部導覽，記為人工預覽通過，不延伸為實機手機通過。新增收費方式關閉重開重新輸入為使用者第 2 項需求確認；本次未修改或宣稱驗證該生命週期。詳細新舊範圍對照見 sports-card-modes-device-acceptance-20261020.md。

本次三種 preset 的相關 6 檔／51 項測試通過，包含舊直向 URL 回退、指南三種尺寸、既有 iframe 導覽及隔離驗收路由守衛。完整 TypeScript、變更檔 ESLint、git diff --check 通過。React 檢查：沿用靜態 presets 及既有 local state，未新增 effect、網路請求或業務提交。新版 Preview 與完整 CI 另以該提交結果核對。
