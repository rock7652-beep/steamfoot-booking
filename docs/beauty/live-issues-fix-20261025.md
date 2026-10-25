# 美業現場問題修復（2026-10-25）

分支：`fix/beauty-live-issues-20261025`；初始基準：`4fa18ba9`；已整合最新 main `fbe2759f`（全站方案開通通知），實作合併提交 `e836c91a`。本批未建立資料表、執行 migration、改寫既有顧客／交易或發送 LINE。

## 已實作

| 問題 | 修正及界線 |
|---|---|
| 預約核對等待 | 後台先核對所選時段，成功立即回傳；有衝突才找整天替代時段。顧客端完整可約時段清單保留，正式送出仍由原 Store 鎖、方案保留額度與多人分配檢查處理。新增 `booking.availability` 耗時及 `availability.load` span。測試證明四時段成功路徑由四次分配降為一次；尚未量得正式登入後的實際秒數。 |
| 技師時間選擇 | 美業 source 使用共用編輯器的 24 小時下拉選單。保留既有非半小時值（例 09:15）；音樂／運動原生時間欄位不受影響。 |
| 收費錯誤提示 | Zod 驗證轉為可讀訊息，不再輸出 issue JSON；沒有合格技師時提示先設定服務資格。 |
| 店家費用／所屬店長 | 收費表單加入選填「店家固定費用」。實收先分配店家費用，其餘歸顧客所屬店長；實收不足時店長分配為零並提示差額。未設定不視為零，舊交易不回推。 |
| 財務快照 | 設定寫入原 `CHARGE_SETTING` 稽核；預約使用 `SERVICE_FINANCE_RULE` 固定當時費用；收款以 `SERVICE_SALE_ATTRIBUTION`、售卡以 `ISSUE_CARD` 固定分配與歸屬。原技師規則 JSON 格式保持不變，付款／帳本沒有改寫。購卡報價檢查費用版本；沒有財務檢視權限者不顯示費用，也不因隱藏欄位遭到錯誤阻擋。 |
| 營運呈現 | 交易列表加入所屬店長、服務技師、店家／店長分配；退款依原實收比例累計沖回。沿用既有技師月結報表，不把技師服務收入再次加總成店家收款。 |
| 單次／體驗入口 | 購買入口提供「多次方案／單次・體驗」切換；後者沿用原服務預約表單，店家選一般售價或體驗價，不自動選取多次卡、不建立一張一次卡。預約成功後走既有服務收款。 |
| 方案註銷／改期限 | 已購方案詳情可註銷、提早／延後期限。需原因、權限、同店顧客範圍、Store 鎖及當前餘次／期限核對；沿用冪等 command。註銷保留餘次、交易、歷史，不自動退款；有待服務預約不得註銷。改期限不能越過既有預約；到期日為台灣時間當日結束。成功後重新讀取該方案與列表。 |
| 清單資料同步 | 名單顯示目前顧客姓名、電話與服務提醒，服務名稱／時間仍保留預約快照。標籤初次讀取失敗顯示重試入口，不永久停在灰色載入條；已載入資料保留。 |
| 圖片公告 | 公開接口接受有效試用店，過期、取消試用及停用店仍阻擋。素材查詢保留同店範圍及有效發布期間檢查。 |
| 標籤預設 | 沒有設定紀錄的新店預設開啟；新增標籤設定亦預設開啟，明確關閉的店家設定保留。正式店 soulife 唯讀確認目前已開啟，沒有為此操作資料庫。 |
| 工單／進銷存 | 補回美業日常工作導覽入口，保留既有功能資格與角色權限。 |
| LINE 視窗 | 原入口誤讀總部多店檢查頁；改接既有本店連線檢查元件，唯讀檢視不能修復設定。名稱改為「LINE 通知連線」；官方網址僅維護於店家資料。 |
| 多餘分隔線 | 自行預約設定沒有錯誤或待核對內容時，不建立空提示區塊。 |

## LINE：程式準備完成，連線尚缺

使用者已明確指定「店家自己的官方 LINE」。Production `BEAUTY_MODULE_ENABLED=1`，但 `BEAUTY_NOTIFICATIONS_ENABLED=0`；環境中未列出本店的 `STORE_LINE_CONFIG_JSON` 註冊資料。官方 LINE 網址不等於 Messaging API 認證。

本批未借用任何其他店家／平台帳號、未新增密鑰、未啟用外部發送。需由店家在安全設定管道提供本店 Messaging API 與登入／Provider 歸屬資料，再核對現有每店 LINE 註冊格式；密鑰不得貼進對話、報告或 Git。

已補正式 worker 發布界線：啟用需 Production main、`BEAUTY_NOTIFICATION_WORKER_REVIEWED=1` 及有效 UTC `BEAUTY_NOTIFICATIONS_START_AT`。既有關閉／本機／Preview 邊界保留；正式預檢於啟用時唯讀檢查 worker 欄位。啟用前服務事件不補發，舊卡低餘額需有啟用後帳本異動才提醒；未來真正到期日提醒仍適用舊卡。體驗關懷只涵蓋啟用後符合規則的服務，沒有為驗證而發真實訊息。

## 驗證

- 整合最新 main 後：129 個測試檔、1,044 項通過；TypeScript 通過。較早的 1,012 項與單組補驗包含在本次結果中，不重複加總。
- ESLint：無錯誤；Sidebar 原有不必要 hook dependency 警告一則。
- 實際共用元件的本機 Chromium 假資料：1366×900、1024×768、768×1024、390×844，共 16 張畫面；頁面無水平溢出、無 page error。驗證時間下拉、期限送出，以及體驗 $600／一般 $1,000 切換、不選用既有卡。
- 瀏覽器後端及外部網路均被攔截；假資料送出不代表真實資料庫儲存、正式登入驗收或實體裝置驗收。
- 兩份既有 UI 測試在修改前基準亦失敗；只補測試的 navigation/session 替身，沒有放寬正式授權。
- 未執行含自動 migration 的 `npm run build`。

證據：[瀏覽器結果](evidence/20261025-live-issues/browser-results.json)、[收費 390](evidence/20261025-live-issues/charge-390.png)、[技師時間 1024](evidence/20261025-live-issues/hours-1024.png)、[方案維護 390](evidence/20261025-live-issues/card-maintenance-390.png)、[單次／體驗 1024](evidence/20261025-live-issues/single-consumption-1024.png)。

## 交付狀態

草稿 PR：[#1406](https://github.com/rock7652-beep/steamfoot-booking/pull/1406)。目前程式與本機驗證完成；已將 main 的全站方案通知整合進修復支線，這批修復尚未合併 main、尚未部署。本店 LINE 串接與正式登入後的實際耗時／交易驗證尚待完成，不能宣稱已上線或 LINE 已開通。

## 隔離 Preview 修復與缺項

- 原 Preview 在 `ci-migrate` 的環境邊界檢查失敗：新修復支線未列入既有允許清單，落入通用運動分支錯誤；並非確認運動旗標誤開。
- 精確允許 `fix/beauty-live-issues-20261025` 使用既有 hosted Beauty Preview 邊界；其他分支、正式庫、Production 與 LINE 發送仍阻擋。僅設定此支線的 Preview 環境，使用獨立 Sensitive AUTH_SECRET；無自動 migration。
- 環境與通知範圍回歸：5 個測試檔、59 項通過（包含新支線、相似未授權分支及錯誤資料庫阻擋）。
- 唯讀確認隔離庫 `ttworfzgwejdeolegkxl` 仍有 `beauty-hosted-20261021` 美業測試店，但尚無 `PlanActivationNotification`。最新 main 的方案通知接點依賴該表，不能宣稱購買方案的真實流程驗收完成。
- 對應既有升級檔：`prisma/migrations/20261025160000_plan_activation_notification/migration.sql`；本批未執行，亦不以停用檢查掩蓋缺項。正式站與既有交易未動。
- Vercel 首次修復後 Preview 已完成 Next 編譯、TypeScript 與輸出建置（部署 `dpl_Ch93EeLEHki8yMH3EJ8Un55hEdXv`）；補齊正確的支線收費編輯旗標後再建置。測試站可用性不等同缺表交易驗收完成。

## 使用者授權後：隔離測試庫新增方案通知表

使用者明確允許「只在隔離測試庫新增這張表，再續驗收」後，於 2026-10-25 23:29（台灣時間）執行。唯一目標為 `ttworfzgwejdeolegkxl`，執行前確認目標美業測試店存在且表不存在。

- 套用既有 `20261025160000_plan_activation_notification/migration.sql`，檔案 SHA256：`bf6608b505260e15ccd02ebdedb6622bc758f8a97af5e27929613ca9a910f9fe`。
- Supabase migration：`20261025152957_beauty_preview_plan_activation_notification`。只新增本表、其約束／索引／RLS 與既有角色適用的權限；未執行其他 migration，未更新既有顧客、交易或店家資料。
- 確認 17 欄位、主鍵、同店／模組／權益去重索引、待發查詢索引與 RLS。
- 隔離庫沒有此 migration 指定的專用美業角色，因此本表無對應角色政策；`anon`／`authenticated` 無 SELECT 權限。安全顧問只有本表「RLS Enabled No Policy」INFO，符合目前僅伺服器存取的用途，未增加公共政策。
- 真實隔離庫交易內寫入標記 schema probe，第二次相同權益事件 `ON CONFLICT DO NOTHING`，驗證只有一筆、狀態 SKIPPED；整筆回滾。回滾後表內 0 筆、待發 0 筆，未發送 LINE。
- Prisma migration ledger 未修改；Supabase ledger 已留紀錄。未來若改用 Prisma 自動 migration，須先核對 checksum 並正式對齊歷史，不得直接再次 CREATE；目前 hosted Preview 仍禁止自動 migration。

新版測試部署 `dpl_7jwoEb2yHRVYRrga1rmxvJHz4XWQ` 已 READY，程式 `c305709141fd3ae3e18d82c7cde448b89d3183fb`。入口：
https://steamfoot-booking-3dd4uotjr-rock7652-2111s-projects.vercel.app/hq/login?store=beauty-hosted-20261021

登入頁經 Vercel 授權 fetch 回應 200。尚未通過登入後的完整交易驗收：本次工作環境沒有先前的測試帳密檔或可沿用的應用程式 session；雲端 Default profile 僅有 Google／GitHub 登入紀錄。已詢問測試站登入狀態；不合成應用 session、不重設既有人員密碼。正式庫與 Production 環境未操作，LINE 保持關閉。

後續使用者選擇不使用付費 TinyFish，並允許建立隔離驗收帳號；已使用免費本機 Chromium 正常登入，完成轉帳購卡折抵、出席／恢復、未出席扣次／不扣次、取消、期限調整與註銷驗收，帳號已停用。最新通過範圍、證據及尚缺案例見 [免費本機實際驗收](free-hosted-acceptance-20261026.md)。此更新取代上段的登入阻擋狀態，不代表全項交易驗收完成。
