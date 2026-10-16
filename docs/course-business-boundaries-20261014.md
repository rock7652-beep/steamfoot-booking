# 音樂／運動課程邊界盤點與第一階段整理

日期：2026-10-14（Asia/Taipei）。以本工作區程式碼為依據；沒有查詢正式資料庫、發送通知、遷移資料或部署。

下方第一階段盤點保留當時範圍；最新進度見文末「第二階段」。

## 目前依賴與所有權

| 項目 | 現況／入口 | 所有權與下一步 |
|---|---|---|
| 模組授權 | `industry-module-server.ts`、`course-access.ts`、`course-store-lock.ts` | Store.industryModule 仍區分 STEAMFOOT／SPA／COURSE；後端授權與交易鎖保留。音樂／運動仍是 COURSE 的業務分類。 |
| 業務分類 | `store-business-profile.ts`；ENABLED 的 business.music 表示 MUSIC，缺少時維持 FITNESS | 新增 `services/course-business-profile.ts`，沿用既有解析器，使用呼叫者 reader／交易，不快取跨交易結果。這是業務分類，不取代模組授權。 |
| 課次／方案／預約 | `course-prisma/schema.prisma` | 兩產業仍共用 Course 表及音樂延伸欄位；本輪未拆資料表。 |
| 購買 | `course-members.ts` → `course-assignment-checkout.ts` | 購買入口改用交易內業務分類；音樂期數、插班課次核對與計價移到 `course-purchase-rules.ts`，運動拒絕音樂購買選項。收款、折扣、冪等與 ledger 仍由原交易處理。 |
| 預約／排課／候補／同行 | `course-booking.ts`、`course-availability.ts`、`course-waitlist.ts`、`course-companions.ts` | 本輪集中業務分類查詢，保留各入口原有查詢時機及店別驗證。 |
| 出席／請假扣額度 | `settleCourseBooking` | 新增 `course-debit-policy.ts` 分開音樂與運動規則；政策只決定結果，授權、餘額更新、效期及 ledger 維持原交易。音樂團班請假扣堂、個別請假釋放、音樂曠課不發補課券，運動既有規則保留。 |
| 點名更正／還原／退款 | `course-booking.ts` 的 correction／restore；相關退款入口 | 仍依既有 booking 狀態及交易快照處理；本輪未抽離。必須另驗證扣回／返還、首次啟用效期重算及退款冪等。 |
| 前台購買 | `course-portal.ts` | 尚有直接 business.music 判斷與購買確認流程，未納入本輪購買規則抽離；需下一輪核對與後台規則一致性。 |
| 方案編輯／人員與其他設定 | `course-members.ts`、`course-staff.ts`、`course-settings.ts` 等 | 尚有直接 entitlement 判斷；應逐入口遷移，不宣稱所有判斷已統一。 |
| 身份、權限、現金帳 | 主 Prisma、permissions、CashbookEntry | 保持平台共用，以 storeId 與權限檢查區分；不複製每店一套。 |

## 教師報酬與通知盤點

- `music-finance-access.ts` 已有音樂教師範圍與專用財務權限。這是財務授權邊界，不能以買課或一般交易權限替代。下一輪將其業務分類查詢接入集中入口，保留 scope 撤銷與運動授權契約的測試。
- `course-teacher-fee.ts` 的 `capturedTeacherFee` 依課次快照 revision／calculationVersion 選算法；v2 使用原單堂價逐學員計算，歷史規則另有算法。抽離時計算版本仍以不可變快照為準，不能以店家現在的 MUSIC／FITNESS 設定重算舊薪資。
- `course-compensation.ts`、`course-monthly-settlement.ts` 與 analytics 是報酬設定、結算及分析入口。後續應分開音樂及運動計酬服務，同時保留原快照、確認與付款流程。
- `course-reminders.ts`、到期／低額度提醒與 coach notification 共用發送基礎；目前上課提醒沒有必要強行拆成兩套傳送引擎。產業差異應放在候選事件、內容與條件；收件人核對、店家通道、去重／重試、額度與 MessageLog 留在共用傳送層。
- 本輪教師報酬與通知為盤點及回歸，未修改計算或外發流程，沒有實際通知外發。

## 後續順序與驗收

1. 完成前台購買、方案編輯、更正及退款入口的規則抽離；既有 storeId、permission、鎖、冪等檢查不得移除。
2. 將剩餘分散分類查詢逐步接入集中入口；不可把未知模組當作運動，COURSE 授權仍先由原守衛執行。
3. 拆教師計酬服務並明確保留歷史快照算法，核對單堂、團班、免費體驗、教師補課、請假／曠課與結算重試。
4. 明確區分通知業務事件與傳送層，核對兩產業候選事件及內容，不新增未授權外發。
5. 有需要時才建立音樂／運動延伸表，以加法 migration、回填及逐流程切換進行。維持同一套部署。

## 本輪驗證

- Vitest：15 檔、221 項通過、0 跳過；涵蓋新業務邊界、購買結帳、點數預約、共用卡、點名更正、排課、同行授權、候補 action、教師費、音樂財務權限、提醒、音樂期課、批次點名、模組防火牆及業務分類。
- 本輪沒有 UI 修改；沒有宣稱 Preview／瀏覽器／真實 PostgreSQL 交易／正式環境驗收完成。
- TypeScript `tsc --noEmit`、變更檔案 ESLint 及 `git diff --check` 通過。
- 這是第一階段邊界整理，不是各產業完全隔離，也不是整條購買、退款、報酬及通知鏈已拆完。

## 第二階段：前台購買、方案編輯與歷史返還

- `course-portal.ts` 的前台購買與核帳改用共用交易內業務分類。前台購買、店長核帳及後台結帳共用 `assertCoursePurchaseUnit`，保留各入口原錯誤訊息；音樂 POINT 訂單在建立訂單／卡片及收款紀錄之前拒絕。
- `saveCoursePointPlan` 的分類判斷、課程來源核對、音樂價格／效期計算全部移入原 `courseTransaction`。先取得店家鎖，再讀取設定；不再先於交易外查詢音樂分類與課程售價。
- 新增 `course-plan-rules.ts`，將音樂每期價格、堂數、贈送與效期的計算，以及運動拒絕音樂期別設定抽離。目錄選取及內嵌 musicSetup 共用同一個報價函式。
- 共卡成員更新改用共用交易內分類；畫面更新、名單詳情及批次點名的呈現判斷改用集中 ORM 讀取介面。呈現查詢不作為扣額度授權依據。
- 點名更正與教師未授課返還共用 `courseBookingWasDebited`，依原出席／曠課／GROUP_LEAVE_FORFEITED 記錄決定已扣額度，不能以現行店家分類重解釋歷史。更正目標與首次使用效期重算仍由原交易處理。
- 已檢查 `course-refund.ts` 及 `course-purchase-correction.ts`：兩者依原訂單、卡片、收款帳及退款紀錄處理，沒有產業分支。保留共用現金退款服務，不建立僅名稱不同的音樂／運動退款副本，也沒有引入自動按比例退款公式。
- 新增前台拒絕音樂點數購買／核帳及依訂單快照核帳的測試。調整方案測試的 transaction fixture，並以鎖內最新分類驗證過期介面輸入不能繞過運動共卡／音樂堂數限制。

下一個開發階段為教師計酬服務、音樂財務授權的集中分類及通知事件／傳送邊界。維持同一套部署；產業專屬延伸資料表與真實資料庫端到端驗收仍未執行。

第二階段驗證：Vitest 24 檔、325 項通過、0 跳過；`tsc --noEmit`、變更檔案 ESLint 與 `git diff --check` 通過。均為本機程式／模擬交易驗證，不代表真實資料庫或正式環境驗收。

## 第三階段：教師計酬、財務授權與提醒事件

### 計酬規則

- `teacher-fee-types.ts` 定義共用輸入／結果；`music-teacher-fee.ts` 擁有音樂 v2 的原單堂價、逐學員四捨五入、免費體驗基數與教師補課排除規則。
- `course-legacy-teacher-fee.ts` 保留運動固定授課費及歷史音樂快照的計算；原 `courseTeacherFee` export 維持相容。歷史 CLASS 及聚合四捨五入行為保持原樣。
- `course-captured-teacher-fee.ts` 只依課次不可變 calculationVersion 選擇算法；`course-teacher-fee.ts` 保留批次席位／原購買價格查詢與相容出口。付款、月結及分析仍透過同一快照入口取得金額。
- 新增測試：相同兩位學員、單價 650、比例 65%，歷史算法為 845 元，音樂 v2 為 846 元。空堂歷史固定費仍為 500 元，v2 為 0 元；revision=0 仍需人工核對，不默認為零。
- `saveCourseCompensation` 的 SHARE 適用性改在店家交易鎖內讀取。CLASS 維持原流程，運動不能設定音樂拆帳比例；教師授課資格、修訂比對及寫入守衛仍保留。

### 財務授權

- `isMusicFinanceStore` 改用集中 `isMusicCourseStoreFromEntitlements`，保留原 request cache 及財務權限契約。人員設定入口的音樂拆帳判斷也接入集中讀取。
- 授權仍分為原 `courseManager` 的店別／基礎權限，以及音樂 teacher.* 權限與教師 scope。`canMusicFinance` 對運動回傳 true 僅代表無額外音樂限制，不能當成獨立平台授權；呼叫者仍須先通過原入口守衛。
- 教師 scope 為 null 才可執行整店 aggregate mutation；指定教師範圍、空範圍、跨店與停用人員的既有拒絕規則保留。scope 撤銷與分類讀取失敗的測試確認不降級放行。
- 為避免既有單連線 pool 自鎖，人員設定的全域權限查詢仍在交易外執行；未宣稱所有財務授權查詢均已移入同一交易。

### 通知事件與傳送

| 層級 | 所有權 | 入口 |
|---|---|---|
| 上課提醒事件 | 課程模組候選課次／學員、台北日期、內容、試課確認按鈕、事件識別與 retry key | `course-reminder-events.ts` |
| 上課提醒傳送 | 店家鎖、重新確認預約有效、規則狀態、發送額度、收件人與 LINE 通道驗證、去重、隔離 Preview 保護、MessageLog 及重試 | `course-reminders.ts` |
| 其他課程事件 | 到期、低額度、未完成提醒、店長及教師通知 | 保留各自現有 service；本輪核對相關回歸，未強制遷入上課提醒事件介面 |

`prepareCourseReminderEvent` 不選擇 LINE 收件人、不呼叫傳送 API；傳送層在店家鎖內核對當前預約與通道後才發送。保留原事件 hash、retry UUID、文字與按鈕；改期產生新事件識別，重試及文字修改維持同一識別。本輪沒有執行通知排程或實際外發。

第三階段驗證：Vitest 18 檔、182 項通過、0 跳過；`tsc --noEmit`、變更檔案 ESLint 與 `git diff --check` 通過。包含薪資快照、付款、月結、分析、教師 scope、人員設定、上課提醒去重／重試、到期與低額度提醒。均為本機程式與模擬交易測試，未完成真實資料庫、LINE 實機、Preview 或正式環境驗收。

目前完成程式邊界整理，仍是一套部署、共用 Course 表。後續需在隔離 Preview／測試資料庫驗收購買 → 上課／請假 → 計酬 → 月結／付款，以及通知候選／去重的完整鏈路，通過後再安排受控上線。

## 第四階段：隔離 PostgreSQL 業務鏈驗收

環境：本次專用 PostgreSQL 17.6 Docker 容器，僅綁定 127.0.0.1:54379，資料庫 `course_boundaries_test`。測試 URL 必須通過 loopback 與 `_test` 名稱守衛，各測試另建隨機 schema；沒有使用遠端或正式資料庫。驗收完成後已停止並自動移除容器與資料。

執行：`course-checkout.pg.test.ts`、`course-student-makeup.pg.test.ts`、`course-refund.pg.test.ts`，3 檔共 22 項通過、0 失敗、0 跳過。JSON 證據保存在 `/tmp/course-boundaries-pg-20261014.json`。新增音樂完整業務鏈於 checkout PostgreSQL 測試，並補齊測試 schema 的產業設定與稽核 outbox DDL；沒有修改正式 schema。

| 驗收 | 真實交易結果 |
|---|---|
| 運動購買 → 預約 → 出席 | 收款 1,000 元、初始 2 堂，預約不扣額度，出席後剩 1 堂；重試只有一筆 DEBIT |
| 運動計酬 → 月結 → 利潤／授課費付款 | 利潤 400 元、授課費 200 元，月結確認可重試；付款更正、撤回與重新登錄保留歷史，最終未付為 0 |
| 音樂購買 | 實收 2,600 元、4 堂；購買重試回傳同一訂單，不重複發卡／收款 |
| 音樂出席／請假 | 出席扣 1 堂、團班請假扣 1 堂、個別請假釋放預留不扣堂；重試團班請假不重扣，最後剩 2 堂 |
| 音樂首次使用效期 | 首次課次啟用 35 天，效期為台北日期 2026-10-29 日末 |
| 音樂 v2 計酬 | 原單堂價 650 元、65% 分潤，出席與團班請假各 423 元，個別請假不產生授課費，合計 846 元 |
| 音樂月結／付款 | 月結確認重試只留一版；兩筆授課費登錄各 423 元，付款重試不增加筆數，未付為 0 |
| 音樂現金帳核對 | 一筆收款、兩筆授課費支出，共 3 筆，淨額 1,754 元；付款不改變剩餘 2 堂 |
| 補課／更正及退款 | 既有音樂個別請假補課、點名更正及協商退款 PostgreSQL 測試通過；同庫不同隨機 schema 執行 |

業務寫入、鎖、ledger、月結快照及現金帳使用真實 PostgreSQL；測試控制日期，並 mock 店長登入／授權、訂閱與功能額度邊界，避免依賴外部帳號。付款是內部帳務登錄，未實際轉帳、扣款或外發 LINE；沒有啟動 outbox delivery worker。

型別檢查、變更測試檔 ESLint 與 `git diff --check` 通過。這次完成的是後端服務 → 真實資料庫 → 月結／付款結果的業務鏈驗收；仍未完成瀏覽器操作、真實登入／權限、部署 Preview 或 LINE 實機驗收。環境未配置 Preview／外部帳號憑證，不能將上述受控授權測試列為實際登入驗收。正式上線與資料 migration 尚未執行。

## 第五階段：遠端 Preview 準備（尚未發布）

已透過連接器確認 Vercel 專案 `steamfoot-booking`（`prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`）及團隊 `rock7652-2111s-projects`。本機 Vercel token 缺失、gh token 驗證失敗，但連接器可讀取專案；Vercel 存在 Preview DATABASE_URL／DIRECT_URL 與共用 Auth 變數的 metadata，沒有解密或輸出值。前述本機無憑證不代表遠端專案未配置環境變數。

預定分支 `codex/course-business-boundaries-20261014`。新增專用建置守衛：只允許 Preview、兩個連線均指向指定隔離庫，拒絕正式庫及可改寫目標的連線參數；在 migration subprocess 之前檢查，通過後跳過本次不需要的 migration。現有 Preview 外發封鎖仍保留。

新增守衛測試後，合併相關回歸：40 檔、481 項通過，0 跳過；TypeScript 及守衛 ESLint 通過。可檢閱差異保存在 `/tmp/course-boundaries-review.patch`。

公開倉庫 `rock7652-beep/steamfoot-booking` 的 create_tree 發布動作遭自動審核拒絕：目前授權未明確涵蓋將本次 37 個變更檔案發布到公開目的地。未建立遠端 tree／commit／分支／Draft PR，也未建立本次部署。已請使用者明確確認公開發布授權，並詢問可用測試店別與角色帳號識別；不要求密碼或 token。既有 READY Preview 是其他提交，不能列為本次候選驗收證據。

## 2026-10-15：授權發布及 Preview 建置結果

使用者已明確授權原 37 檔公開發布，以及後續三檔 Preview 分支登錄修正。已建立 `codex/course-business-boundaries-20261014` 及 Draft PR https://github.com/rock7652-beep/steamfoot-booking/pull/1336。

首版建置因 Next.js 既有分支清單未包含此候選而失敗。補齊分支登錄、共用分支常數及整合測試後，提交 `6b47633b02702bab9109151ae1b4c8456c661391` 已部署成功，狀態 READY，部署 ID `dpl_GtBqFP4jjUafTK1u6guYSMVmdVo2`，網址 https://steamfoot-booking-55rajqmd8-rock7652-2111s-projects.vercel.app。

建置日誌確認 `isolated_database=true migrations_skipped=true notifications_blocked=true`。經 Vercel 已授權保護存取工具讀取 `/login`，HTTP 200 且頁面部署 ID 與候選一致；這僅是入口可用性檢查，未完成真實登入、角色權限及交易瀏覽器驗收。對應修正 10 項測試、TypeScript 與 ESLint 通過。未合併或部署正式環境。

此發布狀態補充目前僅保存於本機文件，未納入三檔修正的遠端提交。

## 2026-10-15：臨時帳號瀏覽器驗收與清理

使用者選擇臨時帳號後，僅在 `steamfoot-preview`（`ttworfzgwejdeolegkxl`）建立本次前綴 `qa1336-6657aa12` 的資料。使用既有音樂／運動測試店，各新增 OWNER、受限 MANAGER、STAFF 教師與 CUSTOMER 學員，共 8 個 User；未重設既有密碼或修改既有交易。密碼隨機產生，僅短暫保存於本機受限檔案，未記錄於報告或提交。

Playwright／Chromium 使用同一候選部署的分支 alias，經 Vercel 臨時分享入口取得保護 Cookie，未停用部署保護。後台六個帳號實際使用登入表單；兩位學員使用真正的 NextAuth Credentials callback 驗證密碼並在瀏覽器檢查會員頁，不將它列為學員登入表單驗收。

| 場景 | 觀察結果 |
|---|---|
| 兩店 OWNER | 可登入本店首頁、課表與月結頁 |
| 兩店受限 MANAGER／教師 | 可登入及讀取已授權課表；整店財務 URL 導回本店首頁，未顯示月結資料 |
| 兩位學員 | 可進入本店會員首頁；後台及財務 URL 導回會員區，不取得後台資料 |
| MANAGER／教師跨店 URL | 回傳找不到頁面；Next 串流回應可能為 HTTP 200，不能只依 HTTP status 判斷授權 |
| OWNER 跨店 | 運動店 OWNER 可依既有上下層店關係進入音樂子店唯讀模式；音樂店 OWNER 存取運動上層店被拒絕，但顯示一般錯誤頁，錯誤 digest `3093190872`，尚需改善拒絕存取呈現 |
| 學員跨店 | 導向另一店的基本資料／註冊入口，沒有取得對方後台；未送出跨店註冊表單 |
| 音樂購買 | 新學員在購買面板選取專用四堂方案，OTHER 收款登錄 2,600 元。UI 顯示「結帳完成，方案已加入」；SQL 確認 CONFIRMED 訂單 1 筆、卡片剩 4 堂、GRANT 1 筆、收款帳 1 筆 |
| 運動購買 | 未指定營收歸屬先被拒絕，訊息為「請先指定本次方案的所屬店長／開發人」。指定臨時 OWNER 後成功，實收 1,000 元、4 堂；SQL 確認 CONFIRMED 訂單 1 筆、卡片剩 4 堂、GRANT 1 筆、收款帳 1 筆 |

購買驗收使用本次 SQL 準備的模板／方案及新學員，這是目錄 fixture，不能代表排課或方案建立 UI 已驗收；實際購買由未 mock 的瀏覽器表單與 Server Action 寫入遠端隔離庫。初次腳本在回應完成前關閉或選到尚未載入的面板，未列為成功；改以新學員 dialog 限定及等待儲存完成後，再以 SQL 核對最終結果。兩店最終各只有一筆本次成功訂單，失敗操作未留下第二筆收款。

### 未完成與限制

- 現有音樂月結頁有 21 筆、運動有 13 筆待核對，無法用這兩店核對完整月結確認。未修改歷史費率、補造金額或強行確認整店月份。
- 本輪未完成真實瀏覽器的預約、出席／請假、教師計酬與月結／授課費付款全鏈；前述本機隔離 PostgreSQL 22 項測試仍為這段的後端證據。
- 教師本人收入另需要 StaffMemberLink、會員身份及店家 personalIncomeEnabled 開關；本次補齊新教師的專用身份綁定，但個人收入頁的瀏覽器檢查未完成，沒有列為通過。音樂店沒有啟用個人收入設定，運動店已有啟用；未修改既有全店開關。
- 未使用未授權角色直接構造 Server Action 財務寫入，也未實際轉帳或發送通知。因此此輪角色 UI 限制不能取代後端越權交易驗收。

### 清理與證據

驗收後已將本次 8 個 User 設為 SUSPENDED、清空密碼雜湊，6 個 Staff 設為 INACTIVE，撤銷本次 StaffMemberLink，停用兩個專用方案及模板。SQL 複核為 8 個停用 User、0 個剩餘密碼。保留測試訂單與帳本供稽核，未改既有會員額度；本次新增顧客為測試身份資料，不刪除歷史關聯。

已撤銷本次分支 alias 的臨時分享連結、移除本機密碼／分享 token 與瀏覽器 session 檔案。角色觀察結果保存在 `/tmp/course1336-music-roles.json`、`/tmp/course1336-fitness-roles.json`，畫面證據為 `/tmp/course1336-*-finance.png` 及購買截圖。本節僅本機保存，未新增公開發布。

完整瀏覽器業務鏈的下一個前提是兩間沒有歷史待核對資料的專用驗收店，或一組經確認可用的獨立驗收月份與課次。當前狀態仍維持 Draft，未合併正式站。

## 2026-10-15：乾淨專用店的點名、計酬、月結與授課費付款驗收

本節補完上一輪因舊店歷史待核對資料而未完成的項目。沿用同一 READY 候選部署，僅在隔離 Supabase `ttworfzgwejdeolegkxl` 建立兩間無歷史資料的測試店：`store-qa1336-clean-9b5011-music`、`store-qa1336-clean-9b5011-fitness`。這輪沒有修改產品程式、發布新提交或重新部署。

### 準備範圍與實際操作

建店、每週時段、模板、教室、方案、教師資格、計酬設定、權限及身份連結以 SQL fixture 準備，依標準建店規則設定 COURSE installation 與 business.music／business.fitness entitlement。音樂設定每週多段時段，符合課表首次設定 gate。

各店準備 OWNER、STAFF 教師、CUSTOMER 學員，以及獨立 CUSTOMER 工作前台身份，共 8 個臨時 User、4 個 Staff。工作前台身份以 StaffMemberLink 連結教師，與後台 STAFF 身份分開；直接用 STAFF 登入會員版面會依既有角色 gate 導回後台，不能當作本人收入頁故障或通過證據。

購買、點名、請假、月結確認及授課費付款使用真實瀏覽器、登入、Server Action 與隔離資料庫，未 mock 授權。為直接驗證已結束課次，每店三堂 `2026-10-14` 課次及 RESERVED 預約以 SQL fixture 建立，明確標記在預約備註；計酬快照由既有資料庫 trigger 自動產生，未直接改寫快照。**本輪不是會員自行預約或排課建立 UI 的完整驗收，也沒有驗證自然時間推進。**

| 核對項目 | 音樂專用店 | 運動專用店 |
|---|---|---|
| 瀏覽器購買 | 2,600 元／4 堂；1 筆訂單、1 張卡、1 筆 GRANT | 1,000 元／4 堂；指定臨時 OWNER 為所屬店長後購買成功，同樣只有一筆 |
| 出席 | 扣 1 堂 | 扣 1 堂 |
| 團體課請假 | CANCELLED／GROUP_LEAVE_FORFEITED，再扣 1 堂 | CANCELLED／STUDENT_LEAVE，不扣堂 |
| 個別課請假 | CANCELLED／STUDENT_LEAVE，不扣堂 | CANCELLED／STUDENT_LEAVE，不扣堂 |
| 最後額度與 DEBIT | 剩 2 堂，2 筆 DEBIT | 剩 3 堂，1 筆 DEBIT |
| 不可變計酬快照 | SHARE 65%、calculationVersion 2、原單堂價 650 元 | CLASS 每堂固定 200 元，保留既有快照規則 |
| 授課費 | 出席及團班請假各 423 元；個別請假不產生授課費，共 846 元 | 三堂各 200 元，共 600 元；固定報酬沿用既有請假計酬語意 |
| 2026-10 月結 | 瀏覽器確認成功，僅第 1 版 | 瀏覽器確認成功，僅第 1 版；另含 OWNER 利潤 1,000 元 |
| 瀏覽器授課費付款 | 2 筆各 423 元，未付授課費 0 元 | 3 筆各 200 元，未付授課費 0 元 |
| 權威帳本 | INCOME 1 筆共 2,600 元；EXPENSE 2 筆共 846 元 | INCOME 1 筆共 1,000 元；EXPENSE 3 筆共 600 元 |
| 工作前台本人收入 | 390×844 顯示本人已確認 846 元、2 筆授課費 | 390×844 顯示本人已確認 600 元、3 筆授課費；不顯示 OWNER 的 1,000 元利潤 |
| 撤回本人收入權限 | 對同一有效登入撤回 teacher.income.read.self 後，重新請求只顯示拒絕訊息，不返回金額 | 同左 |

後台付款結果另以 1440×1000 瀏覽器畫面核對。初版驗收腳本對 hydration、確認後按鈕消失及付款回應完成的等待條件有誤，已改為等候權威頁面逐筆顯示「未付 NT$ 0」，並以 SQL 複核；失敗腳本不計入通過證據。最終兩店總計只有 5 筆有效授課費付款，無重複支出。

### 限制與後續

- 已驗證這組 fixture 的購買 → 點名／請假 → 計酬 → 月結 → 授課費付款；會員自行預約、排課建立及實際 LINE 送達仍需補驗。
- 運動店 OWNER 利潤 1,000 元保留未付，未把「授課費全付清」寫成「全店所有收入全付清」。該頁沒有利潤付款入口，本輪未構造 Server Action 代替瀏覽器操作。
- 兩店 CourseCoachNotification、CourseMonthlyNotification 與 MessageLog 均無本次資料；通知開關保持預設，未按送出通知。這只能證明本輪沒有通知發送紀錄，不能列為通知送達驗收；既有 Preview 外發封鎖仍保留。
- 前輪 OWNER 不允許跨店存取時顯示一般錯誤頁的呈現問題仍待處理。這輪未修改該路徑，也未合併正式站。

### 清理與證據

完成後撤銷本輪 alias 分享連結、刪除本機密碼／雜湊／分享 token 及瀏覽器 session，8 個 User 全部 SUSPENDED 且 passwordHash 清空，4 個 Staff 全部 INACTIVE，2 個 StaffMemberLink 撤銷。兩間專用店設為 INACTIVE 並封存，停用其方案、模板、教室及本人收入設定；保留訂單、額度異動、計酬快照、月結及付款帳本供核對。

本機證據：`/tmp/course1336-clean-{music,fitness}-attendance.log`、`/tmp/course1336-clean-{music,fitness}-pay-verified.log`、`/tmp/course1336-clean-{music,fitness}-income-{after,revoked}.log`，及同前綴 PNG。彙整結果保存在 `/tmp/course1336-clean-acceptance.json`。本節僅本機保存，未新增公開發布；Draft PR 仍為 #1336。

## 2026-10-15：會員自行預約、關閉開關與取消補驗

沿用上述兩間專用驗收店及已購買的卡片，短暫重新啟用兩位學員與授課教師；學員密碼重新隨機產生，未重用前輪密碼，也未啟用既有人員。為各店新增一堂 2026-10-16 10:00 個別課 fixture，**沒有以 SQL 建立這輪的預約**。兩位學員以 `/login` 真正登入表單驗證帳密，並在 390×844 瀏覽器完成以下操作。

| 步驟 | 音樂 | 運動 |
|---|---|---|
| 已開啟確認表單後關閉自行預約 | 舊表單按確認，Server Action 拒絕「如需預約，請聯繫店家」；SQL 核對 0 筆預約 | 同左 |
| 重新開放並重新進入表單 | 顯示「預約成功」，本人建立 1 筆 RESERVED | 同左 |
| 預約後權威核對 | 剩餘仍 2 堂；預留 1 筆；RESERVE 1、DEBIT 0 | 剩餘仍 3 堂；預留 1 筆；RESERVE 1、DEBIT 0 |
| 會員自行取消／請假 | 展開預約明細 → 請假 → 確認請假，CANCELLED／STUDENT_LEAVE | 展開預約明細 → 取消 → 確認取消，CANCELLED／absenceKind null |
| 取消後權威核對 | 預留 0、RELEASE 1、DEBIT 0，剩餘 2 堂 | 預留 0、RELEASE 1、DEBIT 0，剩餘 3 堂 |
| 重新載入會員方案頁 | 顯示「還可預約 2 堂」及「剩餘 2 堂」 | 顯示「還可預約 3 堂」及「剩餘 3 堂」 |

兩筆預約的 operatorUserId 均為對應學員 User，並非店長代約；各自只有一筆 RESERVE 及 RELEASE。前端訊息只作操作觀察，額度與狀態以交易後 SQL 及重新載入方案頁交叉核對。腳本初次未展開預約明細而找不到取消按鈕，補上展開步驟後完成；該定位失敗不列入業務通過證據。

這輪補齊會員自行預約及個別課自行請假／取消，但課次與目錄仍為 fixture，尚不能列為從建店、排課到自然下課的單一完整瀏覽器時序驗收。

### LINE 實機驗收前置結果

`course-reminder-events.test.ts`、`course-reminders.test.ts`、`preview-external-integration-isolation.test.ts` 共 3 檔、20 項全部通過，無跳過；報告 `/tmp/course1336-self-notification-tests.json`。這些是本機受控測試，不是 LINE 送達證據。

目前 `src/lib/runtime-env.ts` 的 `isPreviewExternalIntegrationBlocked()` 對 Preview 一律封鎖外發；`src/lib/preview-line-acceptance.ts` 的舊驗收 scope 僅允許 mocked unit test，不能用環境 JSON 讓本候選部署向外發送。未修改封鎖、未更動 Vercel 環境設定、未讀取或輸出 LINE token，亦未呼叫實際 LINE 發送 API。

已詢問使用者要使用的測試店及已綁定 LINE 的測試會員識別；尚未取得指定收件人。實機驗收仍需準備可限縮至測試店、單一收件人、指定預約、短效期限與重試識別的發送通道，完成可檢閱內容後才進行發送確認。不能以放寬整個 Preview 外發守衛代替此步。

### 本輪收尾

會員操作完成後，兩堂未來驗收課次已取消（先確認無 RESERVED 預約），重新封存兩間店、關閉自行預約，停用人員／模板／方案／教室並清空臨時密碼。保留會員實際建立的兩筆取消預約及額度 ledger；既有授課費付款及歷史計酬快照未改寫。臨時 alias 分享連結已撤銷，local session／密碼／分享 token 已移除。

證據：`/tmp/course1336-self-login.log`、`/tmp/course1336-self-{music,fitness}-flow.log`、`/tmp/course1336-self-{music,fitness}-cancel.log`、`/tmp/course1336-self-{music,fitness}-balance.log` 及同前綴 PNG；彙整 `/tmp/course1336-self-acceptance.json`。本輪只有本機驗收文件更新，未新增公開發布或部署，PR #1336 仍維持 Draft。

## 2026-10-15：合併前重點審查與音樂團班會員請假修正

重點檢查購買／扣堂／計酬／財務 scope／通知事件差異時，找到先前個別課會員驗收沒有涵蓋的團體課問題：會員送出 STUDENT_LEAVE 時，團班規則應扣堂，卻被共用 shouldDebit 分支當成「會員自行點名」拒絕。先新增測試，確實得到「點名僅限有權限的人員」失敗後再修正。

修正如下：

- 已通過預約歸屬、自行請假開關與取消期限檢查的音樂團班會員，可以請假並扣一堂；不開放會員 ATTENDED、CHECKED_IN 或 NO_SHOW。
- 會員的音樂堂數卡 CANCELLED 請求統一依 STUDENT_LEAVE 規則處理，避免選用一般取消狀態規避團班扣堂；個別課仍不扣堂。
- 伺服器內部已授權的改期流程維持釋放原預留，不誤計請假或扣堂。該選項不由會員請求控制。
- 保留重試冪等、他人預約拒絕、自行請假開關、取消期限及教師未授課保護。

本輪發布三檔：`src/server/services/course-booking.ts`、`src/__tests__/course-business-boundaries.test.ts`、`src/__tests__/course-checkout.pg.test.ts`。提交 `3cba0d7c4e0e6d4f9ed1e7e8f2a6e9660ef23af1` 已推進既有分支與 Draft PR #1336；未合併 main。

### 驗證與新候選部署

- 13 檔相關單元測試共 236 項通過，0 失敗／跳過；型別檢查、三個變更檔 ESLint、diff 空白檢查通過。
- 本機一次性 PostgreSQL 17.6：3 檔、22 項通過，0 失敗／跳過。音樂交易測試增加真正會員 actor 的團班取消扣堂、他人預約／會員點名拒絕、重試不重扣，再接計酬、月結與付款；登入授權邊界仍為該整合測試的 mock，不將它算成瀏覽器登入測試。容器已停止並移除。
- 新部署 `dpl_6XTAXCtJAEUY42YKSXn2hUD73hpY` READY，對應上述 SHA；不可變網址 https://steamfoot-booking-cjvhy9bwk-rock7652-2111s-projects.vercel.app。分支 alias 已核對指向此部署後，才開始本輪瀏覽器交易。
- 建置日誌再次確認 `isolated_database=true migrations_skipped=true notifications_blocked=true`。

### 真實瀏覽器團班請假與返還

僅重新啟用專用音樂驗收店與臨時學員／OWNER／教師，使用新隨機密碼；新增 2026-10-17 10:00 團班課次 fixture，預約由會員真實登入表單及會員預約 UI 建立，沒有 SQL 代建預約。

1. 390×844 會員預約 → 展開明細 → 請假 → 確認請假，成功扣 1 堂；重新載入方案頁顯示由 2 堂降為 1 堂。
2. 1440×1000 OWNER 後台將該堂教師出勤改為 LEAVE，顯示教師請假、額度已返還；SQL 確認該預約變為 CANCELLED／TEACHER_ABSENT，卡片回到 2 堂。
3. 該預約 ledger 只有 RESERVE 1 筆、DEBIT 1 筆與 CORRECT:CANCELLED:RESERVED 返還 1 筆，各 1 堂；沒有重複扣堂。另保存 1024×1366 後台畫面。

本輪證實業務寫入與額度返還；教師停課回應當下，部分名單文字仍短暫保留先前「請假・扣堂」，而整堂停課提示與 SQL 已顯示返還，不把該瞬時畫面當作最終資料。會員團班請假確認目前只顯示通用確認文字，尚可改善為明示扣堂結果。這些呈現問題與前輪跨店拒絕的一般錯誤頁仍列為後續 UX 項目，並非已完成驗收。

### 收尾與剩餘工作

SQL 複核返還後才取消本次未來課次、重新封存店家並停用人員、方案、模板、教室與自行預約；清空臨時密碼，撤銷本輪 alias 分享連結。保留真實預約／扣堂／返還 ledger，沒有手動改回卡片餘額或改寫歷史計酬／付款。LINE 外發封鎖維持，實機通知仍待指定收件人及受限發送通道。

本機證據：`/tmp/course-member-group-leave-unit.json`、`/tmp/course-member-group-leave-pg.json`、`/tmp/course1336-group-flow.log`、`/tmp/course1336-group-member-leave.png`、`/tmp/course1336-group-teacher-absence.png`、`/tmp/course1336-group-teacher-absence-ipad.png`。彙整 `/tmp/course1336-group-acceptance.json`。本節驗收紀錄僅本機更新，尚未發布到公開文件。

## 2026-10-15：請假扣堂提示與停課名單同步完成

使用者明確要求補齊這兩項 UI 問題。已發布 9 檔修正至同一 Draft PR #1336，提交 `a843d1bf2efd5432b414b6993f943217b0e5442a`。部署 `dpl_6p7UUUFyftm9f237TPxwHHNJL7od` READY，不可變網址 https://steamfoot-booking-iy6cw7zmo-rock7652-2111s-projects.vercel.app；分支 alias 指向此部署後才開始本輪實際驗收。

### 最終行為

- 會員請假確認依實際課型顯示：音樂團體課明示仍扣本次堂數、不提供補課；個別／自組課明示不扣堂、可於方案期限內安排補課。運動課沿用取消釋放預留的說明，體驗不誤套音樂扣堂文字；課型未確認時不承諾免扣。
- RSC 直接提供課型給會員預約資料與新預約回執，不為確認提示額外增加 client 讀取。通知連結取消視窗也從已授權的最新預約 loader 取得同一份文案。
- 教師出勤寫入成功後，先重新讀取已提交的名單，再同步整堂狀態與成功訊息；不再先顯示停課成功、留下舊的 GROUP_LEAVE_FORFEITED 列。
- 若寫入成功但名單讀取失敗／過期，保留「出勤已儲存，名單尚未核對完成，請重新開啟核對」並暫停後續操作，不把未知名單當作已同步，也不自動關閉視窗。

React 檢查依 Vercel React 指引及本庫 UI Framework 第 40／41 節：保留原共用元件與 native controls、功能式狀態更新、操作 scope／過期回應隔離；新增課型查詢併入既有讀取，不新增共享個資快取或額外前端依賴。

### 測試與真實操作

5 檔相關測試共 88 項通過、0 失敗／跳過；包含延遲權威名單讀取、讀取失敗保護、不同課型提示與通知連結提示。TypeScript、9 個變更檔 ESLint、diff 空白檢查通過。測試報告 `/tmp/course-ui-tests.json`。

在隔離庫沿用兩間專用店及臨時帳號，新增 2026-10-18 的三堂課次 fixture；預約、請假／取消及教師停課均由真實登入瀏覽器與 Server Action 操作，沒有 SQL 代建預約。

| 實測入口 | 結果 |
|---|---|
| 音樂團班會員請假 | 確認前明示「團體課請假仍會扣 1 堂，不提供補課」；送出成功並扣 1 堂 |
| 通知連結取消視窗 | 使用這筆真實預約的 bookingId 開啟 action=cancel，讀取後顯示相同扣堂提示；僅查看並返回，未透過 LINE 外發 |
| 音樂個別課會員請假 | 明示不扣堂，送出後 STUDENT_LEAVE；只有 RESERVE／RELEASE，無 DEBIT |
| 運動會員取消 | 保留釋放預留的說明，取消後只有 RESERVE／RELEASE，無 DEBIT |
| OWNER 登錄團班教師請假 | 成功訊息出現時，名單已是「本堂免扣」，沒有舊「請假・扣堂」；SQL 為 TEACHER_ABSENT，餘額回到 2 堂 |

團班 ledger 為 RESERVE、DEBIT、CORRECT:CANCELLED:RESERVED 各 1 筆、各 1 堂；沒有重複扣／返還。運動卡餘額維持 3 堂，音樂卡最終回到 2 堂。

### 視窗尺寸與限制

- 會員確認及通知連結視窗：390×844、360×844，確認文字可讀、操作可到達、改尺寸後確認狀態保留，無整頁水平溢出。
- 後台停課名單：1366×900、1920×1080、1024×768、768×1024；名單、教師出勤選項及停課結果保留，無整頁水平溢出。
- 使用 Playwright／Chromium 模擬尺寸；不是 Safari、實體 iPad 或 LINE LIFF 的真機驗收。自組課文字與讀取失敗分支由受控測試覆蓋，本輪真實會員課次為團體／個別課。
- 不重複宣稱已完成建店／排課 UI 或自然時序全鏈驗收。LINE 外發仍封鎖，未實際轉帳或發送訊息；測試收件人仍待使用者指定。

完成後重新停用全部臨時 User／Staff、清空密碼、封存店家、停用目錄與自行預約，確認三堂沒有 RESERVED 預約後才取消 fixture 課次；保留實際交易與返還 ledger。臨時分享連結及本機密碼／token 已移除。PR 描述已更新本輪入口、尺寸、證據與限制，維持 Draft，未合併或部署正式站。

畫面及流程證據：`/tmp/course1336-ui-browser.log`、`/tmp/course1336-ui-*-notice-{360,390}.png`、`/tmp/course1336-ui-teacher-absence-{1366,1920,1024,768}.png`；彙整 `/tmp/course1336-ui-acceptance.json`。本節文件仍僅本機保存；公開 PR 描述已同步最新驗收摘要。


## 2026-10-15：跨店拒絕提示與恢復入口

已將店舖讀取授權移到後台 layout 的稽核／其他店舖資料查詢之前；只將 AppError FORBIDDEN／NOT_FOUND 轉為服務端明確提示，不再依賴正式建置會遮蔽的錯誤訊息。既有讀寫授權 resolver 保留，不將一般資料庫故障當成權限不足。

拒絕頁只顯示通用訊息及經 session.storeId 查得的自己店舖恢復入口，不顯示被拒絕店舖的名稱或其他資料。使用共用 ErrorState，返回文案可設定。實際 Preview 驗證曾發現 Next 共用 layout 在 client navigation 時保留拒絕畫面，因此此恢復入口使用完整頁面載入，其他 ErrorState 入口預設不變。

針對性驗證：8 檔／79 項測試通過，含拒絕後無 scoped layout reads、未知錯誤保留、子店合法查閱不被攔截，以及跨店恢復使用完整導覽。TypeScript、變更檔案 ESLint 與 diff 空白檢查通過。

最終提交 `d95b82593f65f7098500bae31e08a96c171f5db3` 已部署至隔離 Preview（READY），分支 alias 核對指向 `dpl_E9hw5jsDsspmT2DjBDhiu1uUxCQR` 後才驗收：

- 音樂與運動各 1 位 OWNER、1 位教師：直接跨店開啟後台顯示明確拒絕提示，返回連結指向自己的店舖且實際恢復成功；音樂 OWNER 另以鍵盤 Tab／Enter 完成返回。
- 音樂／運動會員各 1 位：後台入口導回會員前台的個人資料頁，沒有進入後台。
- 僅在兩個專用 fixture 店建立臨時母子關係：運動母店 OWNER 仍可查看音樂子店課表，顯示「子店唯讀查看模式」；既有測試確認 descendant writes 仍拒絕。本輪未透過 UI 執行子店寫入。
- 拒絕提示尺寸：1366×900、1920×1080、1024×768、768×1024、360×844、390×844，主要連結可達、文字可讀、無整頁水平溢出。Chromium 模擬尺寸，非 Safari 或實體 iPad 驗收。

Preview： https://steamfoot-booking-f07vijz8c-rock7652-2111s-projects.vercel.app 。母子關係已還原為原先兩店皆無上層；全部 8 個臨時 User 停用並清空密碼、4 位 Staff 停用、兩店重新封存，分享連結已撤銷，本機密碼／token 已移除。沒有修改正式資料庫或 schema；沒有發送 LINE。LINE 實機仍待指定收件人，通知外發維持封鎖。

證據：`/tmp/course1336-access-acceptance.json`、`/tmp/course1336-access-browser.log`、`/tmp/course1336-access-child.log`、`/tmp/course1336-access-denied-{1366,1920,1024,768,360,390}.png`。本節保留於本機更新紀錄，公開 Draft PR 描述同步本輪結果。


## 2026-10-15：合併前 CI 收尾

核對上一候選 `d95b82593f65f7098500bae31e08a96c171f5db3` 發現 Vercel 與 Typecheck 成功，但 Changed-file ESLint／Targeted tests 失敗；Full Vitest baseline 也有相同兩項守衛失敗（10489 項通過、2 項失敗、130 項跳過）。因此不能將先前針對性測試通過等同於整個 PR 的 CI 已通過。

兩項修正已發布至同一 Draft PR，提交 `51ecdea6d036f337ee05346391e4b348110eb1e9`：

- ESLint 的 PR 檔案選取改用 base...head 的共同祖先差異。直接比較兩個 tip 會將主分支已刪除的舊檔案誤列為此分支新增，GitHub 的合併 checkout 卻沒有該檔案，導致 ESLint 在執行檢查前中止。臨時 Git repository 重現並驗證修正，不靠忽略不存在檔案掩蓋問題。
- 課程隔離 Preview 守衛移至既有 SEO／文章 review branch 的最前置拒絕檢查之後，仍在任何 migration subprocess／DB client 之前。保留舊分支的禁止部署契約與本分支的隔離資料庫／通知外發封鎖；沒有移除測試或放寬限制。

本機 4 檔／72 項守衛、公開頁及建置契約測試通過，Node 語法檢查與 diff 空白檢查通過。GitHub 新提交的 CI 及 Preview 結果另補於下方；沒有重新啟用臨時帳號、執行 migration 或外發 LINE。


GitHub 最終結果（提交 `51ecdea6d036f337ee05346391e4b348110eb1e9`）：

| 檢查 | 結果 |
|---|---|
| Changed-file ESLint | 成功 |
| Typecheck | 成功 |
| Targeted tests | 184 檔／2548 項全數通過 |
| Full Vitest baseline | 1079 檔／10491 項通過；16 檔／130 項跳過 |
| Music makeup isolated database audit | 成功 |
| Sports shared-card isolated PostgreSQL acceptance | 成功 |
| Booking isolated database audit | 觸發條件跳過，不列為通過 |
| Vercel | READY；建置守衛確認隔離庫、跳過 migration、禁止通知外發 |

CI run：https://github.com/rock7652-beep/steamfoot-booking/actions/runs/38669960549 。隔離部署 `dpl_6z69phcmeXxdyM4wq7n4gBrcHPbR`： https://steamfoot-booking-2kzuokwnm-rock7652-2111s-projects.vercel.app ；分支 alias 已確認指向本提交的部署。

本次僅調整兩個 CI／守衛檔案，未重新啟用臨時帳號或重跑業務寫入；先前真實瀏覽器驗收的提交與限制仍如前節。公開 PR 描述已更新結果，維持 Draft、未合併 main／未部署正式環境。尚未驗收：指定收件人的 LINE 實機／LIFF、Safari／實體 iPad，以及建店與排課 UI 起始的自然時序單一完整流程；不得將分段 fixture 驗收說成這些項目已通過。本節完整紀錄仍在本機文件，公開摘要在 PR。


## 2026-10-15：WebKit 跨瀏覽器分段驗收

本輪沒有產品程式變更；針對提交 `51ecdea6d036f337ee05346391e4b348110eb1e9` 的 READY Preview 補驗證。已核對 PR head 與分支 alias，部署仍是 `dpl_6z69phcmeXxdyM4wq7n4gBrcHPbR`。

### 引擎與邊界

下載 Playwright WebKit 26.5 至 `/tmp/course-webkit`；所需 Debian 函式庫只下載並解壓至 `/tmp/course-webkit-libs`，沒有安裝系統套件。臨時啟動 wrapper 加入解壓依賴路徑；由於 Playwright 的 dlopen 預檢只看系統 ldconfig，跳過該預檢後，以實際成功開頁確認引擎可用。瀏覽器網路與本機 IPC 使用執行環境授權。這是 Linux headless WebKit，不是 Safari 或實體 iPad。

沿用兩個專用測試店，暫時啟用音樂 OWNER、音樂／運動學員共三個帳號與上課所需 fixture 人員／目錄。以原目錄建立 2026-10-19 三堂新課次 fixture；預約、會員請假／取消與教師停課皆由真實登入表單及 WebKit UI 操作，沒有 SQL 代建預約或手動改餘額。

驗收腳本曾在應用程式尚未完成導頁時呼叫 page.goto，造成 WebKit 的 navigation interrupted；已調整等待並只重試被中斷的讀取，接續同一筆預約，沒有重送寫入。沒有因此修改產品程式。

| 業務流程 | WebKit／資料庫結果 |
|---|---|
| 音樂團班會員請假 | 確認前明示仍扣 1 堂、不提供補課；成功 GROUP_LEAVE_FORFEITED、餘額 2→1 |
| 通知連結 | 以同一筆真實預約 bookingId 開啟取消視窗，確認相同提示；只看並返回，不外發 LINE |
| 音樂個別課會員請假 | 明示不扣堂；CANCELLED／STUDENT_LEAVE，RESERVE／RELEASE 各 1 筆，無 DEBIT |
| 運動會員取消 | 保留釋放預留文案，RESERVE／RELEASE 各 1 筆，餘額仍 3 堂 |
| OWNER 登錄團班教師 LEAVE | 成功訊息出現時名單已為「本堂免扣」，沒有舊扣堂列；SQL 為 TEACHER_ABSENT，團班 RESERVE／DEBIT／CORRECT 返還各 1 筆，音樂餘額回到 2 堂 |
| OWNER 跨店拒絕與恢復 | 音樂 OWNER 進入無隸屬關係的運動店後台顯示明確拒絕，鍵盤 Tab／Enter 返回自己的店舖成功 |

### 尺寸、清理與限制

- 會員與通知連結：360×844、390×844；教師停課：1366×900、1920×1080、1024×768、768×1024；跨店拒絕涵蓋上述六種尺寸。無整頁水平溢出、文字與主要控制可用、改尺寸後狀態保留。檢視 390px 會員提示及 768px 後台截圖。
- 最後 SQL 確認 8 個臨時 User 全部 SUSPENDED 且沒有密碼、4 位 Staff INACTIVE、三堂新課次沒有 RESERVED 預約、兩測試店 SENT MessageLog 為 0。三堂取消、兩店與目錄重新停用封存、自行預約關閉，保留 booking／ledger。分享連結已撤銷，本機密碼與 token 已移除。
- 本輪補齊 WebKit 引擎證據，不宣稱完成 macOS／iOS Safari、實體 iPad、LINE LIFF 或自然時間推進的建店到月結單一完整流程；沒有實際轉帳、發送 LINE、合併 main 或部署正式站。
- 公開 Draft PR 描述已同步本輪驗收。完整本機證據：`/tmp/course1336-webkit-acceptance.json`、`/tmp/course1336-webkit-browser.log`、`/tmp/course1336-webkit-access.log`、`/tmp/course1336-webkit-*.png`。


## 2026-10-15：從新建店開始的連續流程（已完成）

使用者要求本輪跳過 LINE／LIFF，繼續建店 → 設定 → 排課 → 購買 → 出席／請假 → 計酬 → 月結／付款。沒有授權合併正式站。

- 只以 SQL 建立臨時 HQ 登入身份 `qa1336-flow-adce2c-admin`；兩間店、OWNER、教室、教學項目／課程、班型／方案、教師／教練、資格與計酬設定、課次、顧客、收款及預約全部由實際 UI 建立。新店 slug：`qa1336-flow-adce2c-music`、`qa1336-flow-adce2c-fitness`，Store ID 加 `store-` 前綴。
- 音樂：鋼琴團班 4 堂，650 元／堂、整期 2600 元、35 天、65% 教師拆帳。運動：十點 1000 元、35 天、課程每堂扣 2 點、15 分鐘；授課費 CLASS 200 元／堂；方案成本 600 元、開發人所得 400 元，購買指定 OWNER。
- 原當日 13:30–14:00 的空課次已過預約截止，UI 正確拒絕新增預約、未扣額度。後續改用尚未開始的課次，沒有放寬時間守衛、修改系統時鐘或以 SQL 改業務日期。
- 途中發現原永久 FUTURE 調課被錯存為臨時調課，違反 `CourseSession_reschedule_kind_check`（允許 NULL／SINGLE／WEEKS）。交易全部回滾，原課完整保留。修正 FUTURE 永久調整清除臨時原時段欄位；audit move 仍保留 FUTURE，不修改資料庫 schema 或已開始課次的快照保護。
- 另發現 `/dashboard/teachers?action=create` SSR 直接 createPortal(document.body) 造成 document is not defined；新增 mounted gate，保留客戶端自動開啟新增表單。
- 兩項修正及回歸測試共 4 檔發布至同一 Draft PR #1336：`b55103db44a6710ee68a0c5edc880d186b6e7beb`，tree `11e971b9a6c3d59b1027ca553e4b03019d1d4cdc`。部署 `dpl_J6bkZ2vP8CUM2Pj5sPH6ybtDBA7A` READY， https://steamfoot-booking-f6v0oqily-rock7652-2111s-projects.vercel.app ，分支 alias 核對後接續。
- 修正本機 4 檔／54 項測試、tsc、四檔 ESLint 通過。GitHub CI run 38688078413 的 ESLint／Typecheck／Targeted tests（2549 項）／Full Vitest baseline（10495 項通過，130 項跳過）全部成功；Music makeup 與 Sports shared-card audit 成功；Booking audit 條件跳過。
- 更新版已從 UI 將新批次四堂鋼琴課 14:30–15:00 永久換到 14:00–14:30；SQL 四筆 audit.scope=FUTURE，而 rescheduleKind／rescheduledFromStartsAt 均 NULL。現有 13:30 空課批次保留作為先前拒絕與回滾證據，未拿來假裝成功的購買／出席。
- 音樂實際購買 `cmv93s3ph0003l906rdr8nfpm`、卡 `cmv93s3ok0001l906cyqu0iur`，2600 元，4 堂，已加入本堂及後續四堂；10/22 團班請假扣 1 堂，暫餘 3 堂。主測試課次 `cmv945ey70000l306f64f5uhj`，今日 14:00–14:30。
- 運動主測試課次 `cmv94a10e0004l306rc8vquxv`，今日 14:00–14:15；第二堂 `cmv94a6hn0005l306mk50jmzd`，14:30–14:45，已預約並登錄缺席不扣堂。

下課前階段先等待真實課次結束，再接續出席、授課費、月結與付款（最終結果見本節末段）。收款及付款都是系統登錄，不涉及實際銀行交易；LINE／LIFF 跳過，通知外發守衛保留。完整腳本與階段證據在 `/tmp/course1336-full-*`。此階段臨時帳號／店家仍在驗收中；最終已完成清理及分享連結撤銷，詳見本節末段。

### 下課前的核對與多餘課次清理

- 真實 OWNER UI 核對：音樂團班 10/22 請假為 CANCELLED／GROUP_LEAVE_FORFEITED，單筆 DEBIT 1，卡剩 3 堂；運動第二堂缺席為 CANCELLED／STUDENT_LEAVE，RESERVE／RELEASE 各 2 點，卡仍剩 10 點。主課次均仍 RESERVED，尚未預先登錄出席。
- 運動購買 `cmv94awxz000tlb06iei0zdud`、卡 `cmv94awx6000rlb063dki3gbz`，CONFIRMED，價款 1000、成本快照 600、店長利潤快照 400。
- 13:52 的月結 UI：音樂沒有結算項目、確認月結不可按；運動雖有店長利潤 400 元，授課費分類仍為 0。曾開啟運動月結確認表單但按取消，尚未建立修訂。
- 13:59 以 UI 取消運動多排的 14:30 空課；14:00 以「停止後續排課」取消音樂舊空班 10/22、10/29、11/5 三堂。SQL 核對 cancelledAt，原請假／點數流水保留，兩堂主課不受影響。
- 新增教師／教練直接入口 `/s/[slug]/admin/dashboard/teachers?action=create` 在 Chromium 與 Linux headless WebKit 各驗兩店 × 四尺寸：1366×900、1920×1080、1024×768、768×1024。HTTP 200、沒有 pageerror、沒有整頁水平溢出、改尺寸保留未送出姓名；未送出額外人員。另檢視 WebKit 音樂 768px 與 Chromium 運動 1366px 截圖，主要欄位與關閉／儲存操作可見。
- WebKit 驗收腳本第一次誤選隱藏的緊急聯絡人姓名，只有讀取／未送出表單；改用實際姓名 input 後八案例通過。課表腳本改以現行 aria-label／課卡文字選取，不把測試選取器逾時列為產品錯誤。
- 14:02 查新版隔離部署近 20 分鐘 error 日誌，沒有符合項目；不代表全站或其他部署沒有錯誤。
- 月結付款範圍依現行產品：只登錄教師／教練授課費。`operation-guide-daily-20260925.ts` 的 C140 已明示移除新增利潤付款入口；保留店長收入報表及舊付款紀錄，本輪不恢復舊入口、不直接呼叫利潤付款 API。

14:04 以 SQL 只讀核對：兩店 ATTENDED、月結確認、授課費付款、SENT MessageLog 均 0；沒有提前跨過下課門檻。14:08 已先停用並清除臨時 HQ 帳號密碼，關閉 HQ 瀏覽器 context，保留兩位 OWNER 接續驗收。

### 運動店實際下課後完成（14:15）

- 14:12 月結頁重新載入仍為授課費 0、沒有登錄已付入口；14:15:13 點名主課 ATTENDED（課次 endsAt 14:15:00），DEBIT 2 唯一一筆，卡剩 8 點。第二堂仍只有 RESERVE／RELEASE，不扣點，且已整堂取消。
- 14:15:20 UI 確認 2026-10 月結 revision 1：店長利潤 400 元＋教練費 200 元，共 600 元、沒有 issue。
- 14:15:26 UI 登錄教練費 200 元，OTHER，備註明示未實際轉帳；付款 `b59be832-dc8c-4912-ba72-0dd7cd280674`。SQL 確認在 endsAt 之後，一筆未作廢 CourseFeePayment 及相同金額／方式的 EXPENSE CashbookEntry；重新載入仍「已付 200／未付 0」。店長利潤 400 元只列收入，沒有登錄利潤付款。
- 付款表單以 Chromium 1366×900、1920×1080、1024×768、768×1024 驗收，無整頁水平溢出，改尺寸保留付款金額與備註，確認登錄可用；檢視 768px 表單與 1366px 付款後頁面。紀錄在 `/tmp/course1336-full-evidence.ndjson`、`/tmp/course1336-full-fitness-payment-rwd-*.png`、`/tmp/course1336-full-fitness-monthly-paid.png`。

- 補做新版 WebKit 付款後唯讀檢查：初次因 Vercel `vercel.live/_next-live/feedback/feedback.js` 的存取控制檢查及驗收導頁中斷請求而被嚴格錯誤檢查擋下；記錄來源後，改為等待登入導頁穩定，再重新讀取同一筆付款（不重送寫入）。最後四尺寸均 HTTP 200、pageErrors／network 錯誤為空、已付 200／未付 0。保留 `/tmp/course1336-full-webkit-paid-fitness.json` 與四尺寸截圖，不將 Vercel 工具列錯誤當作產品修正。
- 14:21 運動店已完成清理：OWNER／教師身份停用及清除密碼、Staff／目錄停用、Store INACTIVE／archived、自助入口關閉、瀏覽器 context 關閉；音樂店仍保持 TRIAL 供驗收，SQL 清理沒有跨店套用。
- 月結 revision 1 在付款前凍結應領義務，付款狀態另讀即時 CourseFeePayment；因此 snapshot 中 paid=0，而付款後頁面仍「已確認／已付 200」。此為預期的月結與付款事件邊界，不另外製造月結修訂。

### 音樂店實際下課後完成（14:30）

- 14:13 UI 重新讀取仍為授課費 0、確認月結停用；14:30:14 點名主課 ATTENDED（endsAt 14:30:00），DEBIT 1 唯一一筆，卡剩 2 堂，與先前團班請假扣 1 堂分開核對。
- 14:30:24 UI 確認 2026-10 月結 revision 1，只有本堂教師費 423 元；計算明細為學員原單堂價 650 元、65%、逐人四捨五入 423，沒有 issue。14:30:30 登錄 OTHER 付款 `c444f294-d2b8-4282-b399-01487d622976`，SQL 確認在 endsAt 之後，一筆相同金額／方式的 EXPENSE 支出，重新載入仍「已付 423／未付 0」。未實際匯款。
- Chromium 付款表單四種後台尺寸均保留金額／備註、操作可用、無整頁水平溢出；另以 WebKit 實際登入讀取已確認且已付款的音樂月結，四尺寸 HTTP 200、沒有 pageerror／network error、付款狀態保留。檢視 768px 付款表單及 1366px 付款後頁面。這是 Linux headless 引擎驗證，不是 Safari／實體 iPad。

### 未來課次與帳號清理（14:34 核對）

1. 由音樂 OWNER UI 將 10/22 未來測試課記錄教師 LEAVE；成功訊息出現時名單已為「本堂免扣」。先前請假扣掉的 1 堂經正常 CORRECT 流水返還，卡從 2 回到 3 堂。原 RESERVE／DEBIT 保留，沒有 SQL 重設餘額。
2. 由已上完的主課開「停止後續排課」，權威預覽為 2 堂／2 筆預約（10/29、11/5）；10/22 原請假課早已 releasedAt，不在此範圍。驗收腳本原先預期三堂而先停下，SQL 核對後才確認實際兩堂，沒有重送教師請假。兩筆 RESERVED 均正常取消並釋放，已完成的出席、月結與 423 元付款保持不變。
3. SQL 只針對本輪兩店及關聯身份封存／停用：5 個 User 全 SUSPENDED 且 passwordHash NULL、4 個 Staff INACTIVE、2 個 Store INACTIVE 且 archived、2 個顧客自助預約停用，店級自助預約／請假／改期及異動通知關閉，所有本輪目錄停用。
4. 最終 6 筆預約為 2 ATTENDED／4 CANCELLED，沒有 RESERVED；10 堂課中 7 堂取消、1 堂教師 LEAVE，沒有未來 SCHEDULED 且未取消的課。15 筆額度流水完整保留。最終餘額：音樂 3 堂（含清理時返還的 1 堂）、運動 8 點。
5. 月結兩店各 revision 1，音樂 423、運動 600；兩筆有效授課費付款合計 623，均在真實課次結束後、各對應一筆金額及方式相同的 EXPENSE。店長利潤 400 元沒有付款，依現行產品只列收入；不宣稱所有收入都已支付。
6. 兩店 SENT MessageLog 仍為 0。臨時 Vercel 分享連結只撤銷本輪一組，所有瀏覽器 context 已關閉並停止本輪 runner；本機 auth 檔移除 password／bypass。

最終重新核對 PR head `b55103db44a6710ee68a0c5edc880d186b6e7beb`、Draft／未合併，分支 alias 仍指向 `dpl_J6bkZ2vP8CUM2Pj5sPH6ybtDBA7A`。新版隔離部署近一小時 error 日誌沒有符合項目。沒有 schema migration、正式部署、實際轉帳或通知外發。

本輪補齊「由建店 UI 起始，依真實時鐘推進至出席、計酬、月結及付款登錄」的主要連續流程。兩個產品阻塞是在途中修正後接續同批資料驗收，不能說整個建店流程從頭到尾只跑在同一個提交；最終出席／計酬／付款均為 b55103db 候選。LINE／LIFF 依使用者指示跳過，Safari／實體 iPad 仍未驗證。完整本機證據 `/tmp/course1336-full-acceptance.json`（11 組最終斷言通過）、兩店 `*-db-evidence.json`、`*-webkit-paid-*.json`、`*-evidence.ndjson` 及截圖；公開摘要同步至 Draft PR #1336，不為驗收文件額外重新部署候選。


## 2026-10-15：合併前審查、最新 main 整合與發布方案

使用者在完整驗收後要求下一步，接續做合併前審查。未授權合併 main 或正式發布；沿用先前已授權的 PR 分支／隔離 Preview 範圍。

- 檢查 GitHub 實際 PR 56 個檔案差異：產業判斷由交易提供的 reader 讀取；權限仍由 course-access／Music Finance scope 授權，沒有以產業判斷取代授權。扣堂／更正與流水仍在原交易及店鎖內。
- 計酬依課次 calculationVersion 分流，新版逐人取整、歷史版合計取整；保留相容匯出。提醒事件只準備內容與穩定識別碼，傳送器保留對象／通道核驗、店鎖、去重及 Preview 外發封鎖。沒有發現新增可重現的阻擋缺陷。
- 查到正式 main 已為 `f13e3a5ac8ada99ef3484f47d91d43bd4bab4654`，原候選基底後新增 SPA 退役的共用登入／建店／權益入口邊界。另開 `/tmp/steamfoot-course1336-integration` worktree，自 `b55103db` 合入該 main，沒有衝突；保留原 `/workspace/steamfoot-booking` 的全部未提交修改。
- 整合後 `.github/workflows/ci.yml` 同時保留 PR 的共同祖先差異計算與 main 新增的退役模組針對性測試。PR 相對新 main 仍為原 56 檔課程變更；沒有 schema、migration、依賴鎖檔、Vercel 網域／排程設定變更。
- 本機針對共用登入、退役模組、建店、店舖權益、跨店恢復及課程產業／財務邊界的 18 檔／216 項測試通過，整合候選 tsc 與 diff 空白檢查通過。遠端 CI／隔離 Preview 的最終結果及提交 ID，以同一 Draft PR 的更新摘要為準；不把舊完整流程說成在整合提交重跑。

### 已準備的正式發布步驟（待明確授權）

1. 核對 PR 最新 head、最新 main 與 CI／隔離 Preview 全部對應，將本次驗收缺口（LINE／LIFF 跳過、Safari／實體 iPad 未驗）一併交付；取得合併／正式發布明確授權後才改動 main。
2. 在既有 `rock7652-beep/steamfoot-booking` → Vercel `steamfoot-booking` 專案的 main 正式流程發布。隔離 Preview 使用測試庫，不把這個 Preview 直接當作正式成品升級；正式建置須使用正式環境設定並核對 Git 提交。
3. 等正式建置與 CI 完成，核對 `steamfoot.com`／`www.steamfoot.com` 指向對應部署，再做首頁、登入導頁與後台入口的唯讀檢查及錯誤日誌核對；不在正式店建立測試購買、付款或發送測試 LINE。
4. 本輪沒有新增 DDL，也不安排人工 SQL 改資料。若既有正式建置回報 schema／migration 問題，先調查實際狀態，不以重設資料庫或直接套用未審查 SQL 排除。
5. 已只讀確認回滾基準：`steamfoot.com` 目前為 READY 部署 `dpl_2sn3KjkiazB8BYubGvPP24WjCiEX`、main `f13e3a5a`。發布前再核對一次，避免覆蓋其他人的新發布；遇到本次引入的正式故障，回到當時記錄的前一正式部署，保留已寫入業務與帳務稽核資料，不倒改交易日期或餘額。

批准界線來自本倉庫 AGENTS.md：「未取得使用者明確授權，不得合併正式站。」目前只有公開新分支、Draft PR 與隔離 Preview 的授權，不把「下一步」自行擴大為正式發布授權。
