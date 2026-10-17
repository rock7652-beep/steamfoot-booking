# 運動模組即時更新與交易串接盤點

日期：2026-10-17（Asia/Taipei）。版本：`a66ed42c9e7fb15703c6d3644157193d2b12eba4`。

## 結論

目前不能宣稱「所有頁面即時、不跳頁、不重整，且交易完整驗收」。原始碼顯示主要交易已有後端串接與一致性保護，但跨裝置同步主要採條件式 60 秒輪詢，部分入口仍有路由切換與完整重整。正式環境、登入後互動及真實帳務未在本次驗證。

本次工作為唯讀程式稽核與驗證紀錄，不修改業務程式，不部署、不寫入店家資料。

## 盤點範圍與判讀方式

- 已讀取 `src/app` 下全部 192 個 `page.tsx`，並遞迴解析頁面可識別的本地 UI import，產出 `sports-page-source-inventory-20261017.csv`。
- 其中 83 個頁面或其 UI 依賴含課程相關訊號，列為運動／音樂共用或課程分支候選；這不是「83 個都適用運動店」的聲明。適用性仍須依門市方案、角色、模組與功能旗標確認。
- CSV 訊號是程式位置索引，不代表功能已執行。定時器可能只更新時鐘；依賴中的機制可能受條件限制。共同 layout、動態計算 import、API 與伺服器交易另行追查，不由此索引保證完整覆蓋。
- 即時操作回饋、原頁重新取資料、跨裝置同步、交易原子性分開判讀。`router.refresh()` 重新取得伺服器內容，通常不等於瀏覽器整頁 reload；`revalidatePath()` 不會主動推送到所有已開啟裝置。

## 主要入口結果

| 入口／操作 | 原始碼行為 | 判定 |
| --- | --- | --- |
| 首頁 `/dashboard` | COURSE 分支使用 `courses/home.tsx`；`home-controls.tsx` 在下次課程結束／午夜及符合時間條件的焦點恢復時重讀 | 不是持續即時同步 |
| 課表 `/dashboard/courses` | `workspace.tsx` 僅在 `view === "schedule" && panel === "day"` 時每 60 秒及可見性／焦點恢復執行 `router.refresh()` | 關閉當日視窗後，這段自動同步不運作 |
| 課程名單側窗 | `roster.tsx` 的 roster view 每 60 秒權威讀取；操作鎖定或請求進行中會跳過 | 有背景更新，但有延遲與暫停條件 |
| 空間、課程、顧客、方案管理 | 可見局部狀態更新、側窗及儲存後 `router.refresh()`；未發現涵蓋全部管理頁的共用持續推播 | 當次操作可原頁更新；跨裝置仍待補驗 |
| 設定中心 | `settings-panel.tsx` 使用 RightSheet，`router.replace(..., {scroll:false})` 切換 URL，保留 dirty／pending 防護 | 有側窗，但仍使用背景路由導航 |
| 交易與營運 | `/dashboard/revenue` 與 `/dashboard/transactions` 共用 `CourseRevenue`；交易操作成功後 `router.refresh()` | 操作端會重讀，其他已開啟帳務頁不保證立即更新 |
| 現金帳、現金抽屜 | 同步讀取 CashbookEntry，交易服務會檢查現金營業日；需雙裝置測試確認顯示同步 | 後端有串接；不能以資料有入帳代替畫面驗收 |
| 會員／教練 `/book` | `course-portal-client.tsx` 每 60 秒重讀、焦點／pageshow／可見性恢復重讀，最短間隔 15 秒；彈窗、編輯備註及請求進行中暫停 | 非即時推播；停留彈窗時不能保證背景最新 |
| 前台附屬入口 | 我的收入、修改資料、提醒設定仍有一般 `<a href>` 連到其他路徑 | 不符合字面上的所有操作都不跳頁 |
| 人員管理異常復原 | `staff-workspace.tsx` 權限儲存結果 uncertain 時提供 `window.location.reload()` | 明確存在完整重整入口，僅屬異常核對情境 |

側欄來源：`src/components/sidebar.tsx` 的 course 分支映射到課表、顧客、方案、課程、空間、報表、設定；共享營運入口不能只檢查 courses 目錄。

## 核心交易連動證據

| 流程 | 程式證據 | 可確認與限制 |
| --- | --- | --- |
| 共用交易鎖 | `course-access.ts` 的 `courseTransaction()` 在 Prisma transaction 中先執行 `lockCourseStore()`；`course-store-lock.ts` 對本店 Store 做 `FOR UPDATE` | 有防止同店跨課程共卡競爭的設計，仍須 PostgreSQL 併發實測 |
| 預約與名額 | `course-booking.ts` 驗證 requestKey、門市、卡片、占用名額與預留額度 | 後端重新驗證，不只相信前端名額 |
| 出席與扣點 | `settleCourseBooking()` 條件式減額並寫入點數紀錄；更正出席、教師缺席有還點與狀態處理 | 已串接，尚未執行本次真實 DB 回滾／競爭驗收 |
| 店長售卡結帳 | `course-assignment-checkout.ts` 同一 tx 建立額度卡、GRANT、CoursePurchase、CashbookEntry 與 AuditLog；有金額快照及 requestKey 防重 | 有串接與原子性設計 |
| 會員購買與核帳 | `course-portal.ts` 購買先建待核帳訂單，`confirmCoursePurchase()` 核帳後發卡 | 會員送出購買不是自動完成收款，需保留此狀態差異 |
| 體驗收款／更正／作廢 | `course-trial.ts` 授權後進 `courseTransaction()`；`course-trial-payment.ts` 寫收款及收入，更正／作廢寫沖銷與稽核，保留出席狀態 | 收款與出席分開；有 requestKey 防止重收 |
| 方案退款 | `course-refund.ts` 核對原單、累計退款、剩餘額度與占用，登錄退款、停用卡與支出 | 是退款登錄，不會自動銀行匯款或退刷 |
| 交易更正／作廢 | `course-purchase-correction.ts` 保留沖銷與稽核紀錄 | 不是刪除原交易 |

## 優先處理項目

1. **P1：跨裝置／跨入口更新不一致。** 課表關閉 day panel 後沒有上述輪詢；首頁、顧客與方案等入口也不能以課程名單的輪詢代表全部通過。建立明確同步目標與交易完成通知／重讀策略，保留草稿與交易權威查詢。
2. **P1：補完帳務雙視窗驗收。** 售卡、收體驗、退款後，同時核對交易、現金帳、抽屜、首頁及顧客卡片，包含「頁面持續開著」的情況。
3. **P2：快取失效範圍需針對實際入口補驗。** `course-refund.ts` 明列 revenue、courses、cashbook、book；`course-purchase-correction.ts` 與 `course-portal.ts` 的清單也未明列 transactions。transactions 與 revenue 共用畫面，但路徑不同；應測試在 transactions 執行後以及返回曾開過頁面的資料是否一致，不能僅憑路徑清單判定已存在可重現錯誤。
4. **P2：明訂不跳頁範圍。** 核心新增、收款、出席、更正應保留原頁、篩選與草稿；收入、個人資料、提醒設定目前是獨立路徑。異常核對完整重整另列例外。

## 完整體驗前仍需的動態驗收

- 在隔離測試店，從體驗申請／開通、權限與設定開始，進行排課、預約、體驗收款、更正、出席、售卡核帳、扣點、取消還點、退款及現金日結；同步核對前台、後台與帳務。
- 雙裝置同時搶最後名額、同卡跨堂使用、重複點擊及網路中斷重試，確認沒有超額扣點、重複收款或半筆入帳。
- 原頁操作驗收須確認沒有 document reload、沒有意外跳路徑、保留 scroll／filter／tab／草稿；不能只看成功提示。
- 桌機 1366px、iPad 1024×768／768×1024、前台 360px／390px 與 LINE 實際入口待驗。本次未做瀏覽器與實體裝置驗收。

## 本次測試狀態

已執行既有 Vitest：**12 檔通過、235 項通過；3 檔 PostgreSQL 整合測試跳過，共 24 項跳過**。涵蓋方案結帳、退款及 action、交易更正、點數預約、共卡預約、出席更正、體驗 action、名單操作回饋、教師缺席還點、運動共卡與抽屜即時計算。

跳過檔案：`course-checkout.pg.test.ts`、`course-refund.pg.test.ts`、`course-trial.pg.test.ts`；需要明確指定 loopback 隔離資料庫 `BOOKING_CONCURRENCY_TEST_DATABASE_URL`，本環境未配置。通過項目包含 mock 與靜態合約測試，不能替代真正資料庫的競爭、回滾及瀏覽器互動驗收。

已安裝鎖檔指定依賴並執行 `npm run generate:clients`，三個 Prisma client 均成功生成；未執行 migration／seed／production build，未連線正式資料庫。未配置正式站登入及隔離 PostgreSQL，不能宣稱正式站或資料庫整合驗收完成。

## 後續修補（使用者指示「下一步」）

以下為 `codex/sports-background-refresh` 工作分支的未部署變更；上方盤點與 CSV 保留原始版本的發現，不代表修補後狀態。

- 課表關閉 day sheet 時仍每 60 秒背景重讀，沿用 `router.refresh()`，不導航、不做 document reload。day sheet 原有輪詢保留。
- 分頁隱藏時暫停；focus、pageshow 或恢復可見時重新讀取，15 秒內合併重複觸發。離開課表清除 timer 與 listeners。
- 排課／編輯 panel、巢狀名單／預約／租借視窗、dirty、pending 或儲存結果 uncertain 時，暫停課表父層背景讀取；名單維持自己的權威讀取。關閉視窗後恢復定期更新。
- 退款與交易更正／作廢補齊 transactions、cash-drawer 等失效入口；退款也補首頁。會員購買／核帳補 revenue、transactions、cash-drawer；店長售卡結帳補 transactions，保留既有提交後更新安排。
- 這些 path invalidation 只補齊後續重讀範圍，不是跨裝置推播；其他持續開啟的帳務頁仍待後續同步與雙裝置驗收。

驗證：**16 檔、267 項測試通過**；新增課表真實元件 DOM 測試，以及退款、核帳、更正／作廢的失效範圍與失敗不失效測試。受影響檔案 ESLint 通過、全專案 `tsc --noEmit --incremental false` 通過、`git diff --check` 通過。未重跑先前因缺少明確測試 DB URL 而跳過的 PostgreSQL 測試，不將其列入通過數。

受影響入口包含運動／音樂共用課表與交易 action；未調整版面。桌機 1366px、iPad 1024×768／768×1024 的 Preview／瀏覽器尺寸與正式帳務流程仍未驗收，本次 jsdom 不代表瀏覽器幾何、實體裝置、RSC 網路回傳或正式店家的完整驗收。此分支尚未合併或部署。

## 第二輪：隔離資料庫與瀏覽器驗收

### 真實 PostgreSQL：39 項通過、無跳過

另建 `postgres:16-alpine` 暫存容器，僅綁定 `127.0.0.1:55437`，使用專用 `sports_readiness_test` 資料庫，不使用既有開發資料庫或正式連線。PostgreSQL 16 與儲存庫 docker-compose 一致；不代替 CI 的 PostgreSQL 17 驗證。

實際執行以下四組：

- `course-checkout.pg.test.ts`：15 項，含售卡、發額度、入帳、出席扣點、月結與授課費；重複請求與入帳失敗回滾。
- `course-refund.pg.test.ts`：3 項，含六個並行重試、不同退款請求競爭、帳務失敗時退款／卡片／訂單一起回滾。
- `course-trial.pg.test.ts`：7 項，含收款防重、混合付款、更正、並行作廢、出席不誤動額度與已結帳日阻擋現金收款。
- `course-companions.pg.test.ts`：14 項，共卡、同行者、名額、額度、候補與併發交易。

本輪發現並修復**測試 fixture 落後**：體驗測試缺少 `CashDrawerSession`，`AuditLog` 缺少現行體驗完成關懷會寫入的欄位。只修補隔離測試的 DDL，未修改正式 schema 或放寬現金日檢查；新增已結帳日阻擋、零入帳、重新開啟後同 requestKey 可重試的測試。

重跑命令（URL 必須指向明確可丟棄、loopback 且名稱以 `_test` 結尾的資料庫）：

```sh
BOOKING_CONCURRENCY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55437/sports_readiness_test \
  npx vitest run --config vitest.pg.config.ts \
  src/__tests__/course-checkout.pg.test.ts \
  src/__tests__/course-refund.pg.test.ts \
  src/__tests__/course-trial.pg.test.ts \
  src/__tests__/course-companions.pg.test.ts
```

交易服務與 SQL 實際執行；授權邊界在既有測試中仍有替身。課程表由實際 Prisma schema 建立，共用帳務與稽核表採測試必要欄位。這不是完整正式 migration、登入授權、外部金流或正式帳務驗收。測試結束後已移除本次專用暫存容器。

### Chromium 元件 Preview：四種尺寸及雙視窗通過

新增 `scripts/qa/sports-refresh-fixture.tsx` 與 `scripts/qa/sports-refresh-browser.mjs`，渲染實際 `CourseWorkspace` 與 CSS。背景 refresh 改接明確隔離的虛構 HTTP snapshot，業務 action 全部禁止執行。沒有修改正式路由或加入應用依賴。

驗收尺寸：1366×900、1920×1080、1024×768、768×1024。各尺寸確認：

- 60 秒定時器觸發讀取後，實際課表課名更新，URL 與教室篩選保留，頁面沒有水平溢出。
- 排課側窗開啟時不觸發父層背景讀取；填入 75 分鐘後，經過輪詢及旋轉尺寸，草稿仍為 75。
- 側窗在可見範圍內；明確放棄草稿關閉後，課表恢復更新。
- 兩個獨立 browser context 都讀到同一新版本、實際課名都更新；document token 保留，沒有整頁 reload。

證據位於 `artifacts/sports-refresh-20261017/`：`results.json` 與八張 calendar／schedule PNG。桌機與 iPad 直向截圖已人工檢視。

```sh
QA_PLAYWRIGHT_MODULE=/path/to/playwright \
QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
QA_OUTPUT=/tmp/sports-refresh-browser \
node scripts/qa/sports-refresh-browser.mjs
```

限制：使用 Playwright clock 推進定時器；這是 Chromium 視窗尺寸驗證，不是實體 iPad／Safari。UI 的 Next router、Server Actions 與登入由測試替身隔離，沒有證明真實 RSC／正式 API／資料庫完整串起來；雙視窗驗證的是共用虛構 HTTP 資料的背景重讀，不是正式跨裝置推播。

本輪全專案型別檢查、受影響檔案 ESLint 與 diff whitespace 檢查通過。前一輪 267 項單元／元件測試結果保留，本輪另補 39 項真實 PostgreSQL 測試。尚未合併或部署；下一個完整業務驗收邊界是隔離店家的真實登入頁面 → Server Action → 資料庫 → 另一個已開啟的帳務頁。

## 第三輪：真實登入與跨頁交易驗收

使用獨立容器 `sports-live-flow-postgres-20261017`，資料庫固定 `127.0.0.1:55438/sports_live_flow_test`。主資料表由實際 Prisma schema 建立，課程表由課程 schema 建立；教練通知佇列及觸發器採儲存庫既有 SQL migration 安裝。未使用原本開發容器或任何正式資料。

新增 `SPORTS_LIVE_FLOW_QA=1` 的本機驗收模式，因原本啟動守門只接受指定的遠端 Preview 或正式 main。模式只接受 development、指定 loopback 資料庫、指定 localhost／127.0.0.1 網址與連接埠，拒絕部署 metadata、其他資料庫及連線覆寫參數；外部整合仍封鎖。未關閉登入、權限、交易授權或部署檢查。

真實環境需以同一 hostname 啟動與開啟：本次使用 `http://localhost:3107` 並傳 `--hostname localhost`。混用 localhost 與 127.0.0.1 會使本機 rewrite 被視為跨主機 fetch，造成登入後 `/dashboard` 與店家路徑互相重新導向；本次以一致的本機設定解決，未修改正式 proxy 或放寬跨來源登入。

可重跑入口：

- `scripts/qa/sports-live-flow-seed.ts`：只接受明確的 loopback、專用 `_test` 資料庫；建立虛構運動店、老闆、學員、方案與課程。測試密碼只用於此可丟棄資料庫。
- `scripts/qa/sports-live-flow-browser.mjs`：兩個獨立 browser context 各自透過真實登入表單登入，使用實際 Next.js 路由、Server Actions、Prisma、PostgreSQL；沒有替換 auth、router 或業務 action。
- `artifacts/sports-live-flow-20261017/`：本輪實際畫面截圖與 `results.json`；`purchase-first-pass/` 是第一次成功的購買觀察紀錄，結果已顯示會同步，因此**沒有新增額外輪詢修補**。

觀察採實際等待 62 秒，不使用 Playwright clock。已確認在本輪 OWNER／EXPERIENCE 店與這組頁面設定下，購買後保持開啟的交易頁會自動讀到新增紀錄、document token 保留，無需手動導航或重整。這修正了靜態盤點對該入口「尚未確認」的限制；不能外推到所有角色、方案、頁面與裝置。

最終驗收通過：

| 邊界 | 實際結果 |
| --- | --- |
| 真實登入 | 兩個獨立 context 都從 Email／密碼表單登入本店老闆帳號 |
| 顧客管理 → 售卡 | 透過購買側窗登錄信用卡收款 NT$1,000；訂單只增加一筆、狀態 CONFIRMED、卡片剩餘 10 點、對應 CashbookEntry 為 INCOME 1,000 |
| 已開啟交易頁 | 購買前 6 筆、62 秒後 7 筆；沒有對 observer 執行 goto／reload；document token 保留 |
| 交易視窗 → 退款 | 透過退款表單登錄銀行轉帳 NT$400；該訂單只有一筆退款、狀態 REFUNDED，卡片剩餘 0 並有 closedAt，對應 CashbookEntry 為 EXPENSE 400 |
| 已開啟交易頁 → 退款狀態 | 再等待 62 秒後已顯示新增退款狀態；同一 document token 保留 |

Browser 買方為 1366×900、observer 為 1024×768；實際購買與退款截圖已保存，observer 退款圖已人工檢視。測試過程曾建立多筆虛構方案以除錯驗收腳本，最終單次執行以前後筆數差驗證只新增一筆，不把整個測試資料庫說成只有一筆訂單。未操作銀行或外部金流；付款與退款皆為產品原有的收款／退款登錄。

執行環境與命令：

```sh
# 先建立專用容器，再在另一個 terminal 啟動 Next；只使用這個可丟棄 DB。
docker run --detach --rm --name sports-live-flow-postgres-20261017 \
  --publish 127.0.0.1:55438:5432 --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_DB=sports_live_flow_test postgres:16-alpine

DATABASE_URL=postgresql://postgres@127.0.0.1:55438/sports_live_flow_test \
DIRECT_URL=postgresql://postgres@127.0.0.1:55438/sports_live_flow_test \
npx prisma db push --skip-generate

DATABASE_URL=postgresql://postgres@127.0.0.1:55438/sports_live_flow_test \
npx tsx scripts/qa/sports-live-flow-seed.ts

SPORTS_LIVE_FLOW_QA=1 \
DATABASE_URL=postgresql://postgres@127.0.0.1:55438/sports_live_flow_test \
DIRECT_URL=postgresql://postgres@127.0.0.1:55438/sports_live_flow_test \
AUTH_SECRET=isolated-sports-live-flow-test-only-20261017 AUTH_TRUST_HOST=true \
AUTH_URL=http://localhost:3107 NEXTAUTH_URL=http://localhost:3107 \
npm run dev -- --hostname localhost --port 3107

# 另一個 terminal：
DATABASE_URL=postgresql://postgres@127.0.0.1:55438/sports_live_flow_test \
QA_PLAYWRIGHT_MODULE=/path/to/playwright QA_REQUIRE_OBSERVER_SYNC=1 \
node scripts/qa/sports-live-flow-browser.mjs
```

350 項回歸測試（19 檔）、全專案型別檢查、受影響檔案 ESLint、diff whitespace 檢查通過；其中 83 項涵蓋新增本機 QA 守門與既有 Preview／production 隔離回歸。CI 的體驗測試執行數由 6 更新為 7，同時更正既有 checkout 15 項與 workflow 14 項不一致的檢查。

此結果限本機 Next development、PostgreSQL 16、OWNER／EXPERIENCE 設定與上述路徑；正式 Preview／production、其他角色與完整預約出席流程仍未驗。約一分鐘同步通過，仍不是即時推播。未合併或部署；本次 Next 服務與專用 DB 容器在驗收後停止、暫存登入狀態已移除。

## 第四輪：預約、出席扣點與取消還點真實流程

以同一個受限本機 QA 店家重新建立空白 PostgreSQL 16，使用真正帳密登入 Next，透過購買方案、加入學員、點名及取消確認視窗完成操作。沒有 mock Server Action、登入、router 或時鐘；僅初始化店家、課程與顧客使用 fixture。測試腳本：`scripts/qa/sports-booking-live-browser.mjs`。證據：`artifacts/sports-booking-live-20261017/results.json` 及五張步驟截圖。

| 真實操作 | 卡片餘額 | 保留點數 | 可用點數 | 流水 |
|---|---:|---:|---:|---|
| 購買十點方案後預約 | 10 | 1 | 9 | GRANT 10、RESERVE 1 |
| 取消尚未出席預約 | 10 | 0 | 10 | RELEASE 1 |
| 再次預約 | 10 | 1 | 9 | 新預約列、RESERVE 1 |
| 點名出席 | 9 | 0 | 9 | DEBIT 1，僅一筆 |
| 取消已出席預約 | 10 | 0 | 10 | CORRECT:ATTENDED:CANCELLED 還點，僅一筆 |

兩筆預約最終均為 CANCELLED，未刪除歷史。所有預約操作使用同一課程側欄：網址不變、瀏覽器 document token 不變；出席狀態由原頁按鈕更新並與資料庫一致。帳本仍只有購買方案的 INCOME 1000，沒有因取消還點產生金錢退款或額外收支。流水與各步驟保留點數另以資料庫與保存的完整快照核對通過。腳本語法及 git diff whitespace 檢查通過，本輪未變更產品業務程式。

限制：本次為 OWNER 後台操作、單人單點方案、桌機 1366×900、本機 development；課程排在 2026-10-18，使用目前管理者介面允許的提前點名，沒有等待課程自然結束。不涵蓋會員自行預約／取消截止時間、正式環境或本輪跨裝置同步；前一輪跨裝置收退款證據不可替代本輪預約跨裝置驗證。以上後台核心扣還點流程已通過，本輪未合併或部署。

## 第五輪：獨立登入桌機／iPad 模擬端的預約同步

以兩個獨立 Chromium browser context（桌機 1366×900、iPad 尺寸 1024×768）分別真實登入同一隔離店家。桌機透過實際介面購買十點方案、預約、出席及取消；觀察端維持同一個「上課名單」側欄，不重新導航、不重整、不切換焦點、不呼叫測試更新接口、不使用假時鐘。

| 桌機操作 | 觀察端自動更新 | 實測延遲 |
|---|---|---:|
| 預約 | 待點名、名單 2 人、課後剩餘 9 點 | 56.934 秒 |
| 出席 | 已出席、名單 2 人、課後剩餘 9 點 | 59.488 秒 |
| 取消出席 | 名單 1 人、已取消（1）摘要 | 59.418 秒 |

取消者依既有介面移入封存清單；先斷言摘要自動同步後，才手動點「已取消（1）」展開，確認取消者顯示已取消、課後剩餘 10 點。這次點擊只是查看封存資料，不列為閒置同步證據。資料庫同步核對：餘額 10→9→10、保留 1→0→0；DEBIT 僅一筆、取消出席 CORRECT 還點僅一筆。初始另有一名體驗學員，因此上課名單人數為 2→2→1。兩端 URL 與 document token 全程一致，沒有整頁重載或跳頁。

證據：`artifacts/sports-booking-sync-20261017/results.json`、三張操作端截圖、三張 iPad 模擬端截圖及取消摘要自動更新截圖。腳本：`scripts/qa/sports-booking-sync-browser.mjs`。兩次驗收腳本定位問題（多層 dialog、取消者移到封存清單）的中斷證據分別保存在子目錄 `initial-script-diagnostic`、`cancel-selector-diagnostic`；修正腳本後從乾淨資料庫完整重跑通過。本輪沒有產品業務程式修正；腳本語法與 diff whitespace 檢查通過。

本項驗收通過。同步屬既有約 60 秒輪詢，不是即時推播。範圍限本機 Next development、隔離 PostgreSQL 16、OWNER 後台、前景可見的名單側欄及 Chromium iPad 尺寸模擬，不代表實體 iPad Safari、會員自行預約或正式環境已驗收。測試課程仍為 2026-10-18，管理者透過目前介面允許的提前點名操作。未部署或合併正式站；專用服務與資料庫容器於完成後停止。
