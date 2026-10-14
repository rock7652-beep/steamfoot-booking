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
