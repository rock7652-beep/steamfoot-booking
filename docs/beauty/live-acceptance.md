# 美業隔離整合驗收（2026-10-20）

草稿 PR：[#1374](https://github.com/rock7652-beep/steamfoot-booking/pull/1374)。本輪接續 `3433cf196e0daee43593c91b5e41739311840028`，仍使用 `feat/beauty-module-20261020` 獨立工作目錄。原工作目錄仍為乾淨的 `work` 支線。

## 證據與界線

使用專用 Docker 容器 `steamfoot-beauty-1374-qa`、PostgreSQL 16 Alpine、資料庫 `beauty_1374_qa`、僅 loopback 的 `127.0.0.1:32768`。既有 `steamfoot-booking-db-1` 與其 5432 埠、正式 Supabase、共用 preview 均未異動。

先從本支線的 **完整 main Prisma schema 與完整 course Prisma schema** 產生空白建庫 SQL，再安裝 `scripts/sql/beauty-module-candidate.sql`。這比首輪 PGlite 的合成前置表完整，但仍不是正式 migration 歷史重播，也未取得正式 schema 的結構差異證據；目前正式 Supabase 使用 PostgreSQL 17，不能將這次 PostgreSQL 16 結果直接視為正式版本整合通過。

建立明確的 backend LOGIN role `beauty_1374_app`，確認 `NOSUPERUSER / NOBYPASSRLS`，再安裝候選 SQL 的 backend policy 與 GRANT。既有 main／course 表在此空白庫依 schema 建立並授予 QA backend CRUD，**沒有重播既有模組全部自訂 SQL／RLS／audit triggers**。美業 13 表則執行實際候選 SQL、RLS、外鍵、exclusion 與不可變帳本 triggers。

登入帳號、店家、顧客、技師、手機、帳務及 LINE 身分全部是合成資料；不匯入真實顧客。應用程式只開啟本機美業開關，通知總開關為0、店家通知關閉，外部整合仍受既有 `isPreviewExternalIntegrationBlocked()` 阻擋。沒有真實 LINE 發送、OAuth、支付 API、部署環境變數變更、共用庫 migration、合併或正式部署。

## 已實際通過

| 層級 | 結果 | 證據能說明什麼 |
|---|---|---|
| 專用 PostgreSQL／真實 Prisma／domain services | **9項通過** | 13表 RLS 與 browser grants；不同服務同行整組與時長；防重送與變更意圖拒絕；兩個不同 `pg_backend_pid()` 競爭同技師；不同技師競爭最後空間；整組失敗無殘留；具名共卡最後一次、取消釋放、完成扣次／更正回復；實際現金帳、拆帳月結付款／收回及退款；每服務體驗一次。另直接略過 allocator 插入重疊紀錄，確認真實 PostgreSQL exclusion constraint 拒絕。 |
| 實際 Next server、Auth.js 密碼登入、瀏覽器及 Server Actions | **12個情境通過、page error 0** | 公開兩人不同服務；十三項店長功能列與分項預約；會員建立預約、改期、取消；技師只見本人工作並完成服務，會員回讀完成；一般會員不能取得技師工作資料；受限人員沒有新增技師入口；店長不能改網址讀別店；停用店長後既有 session 不再顯示後台操作；合成 LINE entry 解密、建單與一次性消耗；過期／消耗 entry 拒絕，既有手機不能被新 LINE 身分接管；無待發通知。 |
| 來源指定回歸 | **6檔／73項通過** | 美業權限、schema、交易及 scope，既有運動 redesign／course preview scope。 |
| 共用連線及 release guard 回歸 | **5檔／136項通過** | shared-card 與 consultation 的 preview 隔離、runtime guard；本機 QA 範圍拒絕 hosted、production、遠端 DB、錯誤 backend role、通知開啟等設定。與上一列有一檔重疊，不相加當作獨立項數。 |
| 型別、變更來源 ESLint、git diff --check | 通過 | 最終 QA harness 與本機 scope 亦納入檢查。 |

資料庫測試未 mock Prisma、交易、配置器或帳務方法；因沒有 HTTP request，session／permission／store request helpers 以「呼叫就失敗」的 stub 阻擋誤用，直接傳入測試 actor。這一層**不證明 HTTP 授權**；真正登入、撤權與網址切店由第二列的實際 Next 流程驗證。尚未對每個 Server Action 都做低權限偽造請求重放，不能把隱藏按鈕等同後端全部授權覆蓋。

## 三端畫面

這次使用真實登入、真實本機資料庫及真正 Server Actions，沒有 fixture action 替身。桌機 1440×900、iPad 尺寸 1024×768、前台手機 390×844，檢查整頁沒有橫向溢出。這是 Chromium 尺寸驗收，尚非實體 Safari／iPad 驗收。

- [店長桌機](evidence/live/manager-desktop.png)、[店長 iPad 尺寸](evidence/live/manager-ipad.png)
- [公開兩人不同服務成功](evidence/live/public-party-success.png)
- [會員預約成功](evidence/live/member-book-success.png)、[改期](evidence/live/member-rescheduled.png)、[完成狀態](evidence/live/member-completed.png)
- [技師完成服務](evidence/live/worker-completed.png)
- [12項瀏覽器結果](evidence/live/results.json)

## 重現方式

1. 使用新建的任務專用空白 PostgreSQL；本 harness 固定 loopback 32768、DB `beauty_1374_qa`、backend `beauty_1374_app`。禁止對既有容器執行 compose up 或 db reset。建立本機 PG 時明確指定 `--publish 127.0.0.1:32768:5432` 及本任務名稱；若埠已占用先確認來源，不停止別的任務。
2. 以 `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` 與 course schema 產出 SQL，依序安裝。管理連線只限此專用空白庫，建立 btree_gist、anon／authenticated／service_role，以及上述非 superuser、無 BYPASSRLS 的 backend LOGIN；只對已存在 main／course 表授權 CRUD。設定 `beauty_migration.app_role='beauty_1374_app'` 再安裝候選 SQL，後續應用與驗收改用該 backend。
3. 設定僅本程序的環境：`BEAUTY_LOCAL_QA=1`、`NODE_ENV=development`、`BEAUTY_MODULE_ENABLED=1`、`BEAUTY_NOTIFICATIONS_ENABLED=0`、`AUTH_URL=NEXTAUTH_URL=http://localhost:3114`；兩個 DB URL 都須指向專用 loopback DB／backend（密碼由本機建立）。提供合成 AUTH secret 及32-byte base64url `DIGITAL_BUTLER_ENCRYPTION_KEY`，不提供任何外部整合憑證。不得帶 Vercel／Cloudflare hosted metadata。
4. `tsx scripts/qa/beauty-live-seed.ts` 建立合成帳號與資料。測試帳號 `owner/member/worker/limited@beauty-1374.invalid`，只用於這個 loopback 空白庫；測試密碼見 seed。人員與技師使用不同帳號及業務紀錄，沒有新增登入 bypass。
5. 資料庫測試：`BEAUTY_LOCAL_QA= NODE_ENV=test BEAUTY_QA_TEST_DATE=<未使用日期> vitest run --config scripts/qa/beauty-live.config.ts`。保留其他上述本機環境。日期須在可預約30天內，且連續3天沒有舊合成預約；測試會先檢查並拒絕重用。因金融歷史不可刪改，不以刪帳方式清場。最終9項通過使用 `2026-11-04` 起的日期。
6. 啟動 `next dev --hostname localhost --port 3114`，再執行 `node scripts/qa/beauty-live-browser.mjs`。Playwright／Chromium 可用 `QA_PLAYWRIGHT_MODULE`、`QA_CHROMIUM_EXECUTABLE` 指定；輸出路徑可設 `QA_BEAUTY_LIVE_OUTPUT`。不要把此 dev server 綁至公開網卡。**hostname 必須與 AUTH_URL 相同**：先前 127.0.0.1 與 localhost 混用會令本機 rewrite 重入 proxy 形成重導；統一後以正常授權流程通過，沒有為此放寬 proxy。

首次測試 harness 合併 config 時意外沿用一般 include，及早中止後改為明確只執行單一整合檔。瀏覽器初稿亦曾選到收合區的文字／舊同名預約，修正為真正可見服務標題及當次備註定位。一次資料庫重跑使用了已存在的合成預約日期，系統正確拒絕；改用未使用日期與每輪獨立合成手機，加入前置檢查後9項通過。沒有透過跳過斷言或刪除失敗測試取得通過。

## 仍未驗證／未啟用

- **正式已啟用：否。** 正式 schema 差異、既有 RLS／triggers／backend role、PostgreSQL 17／Supabase pooler 與正式 migration 順序仍需另外驗證。
- 真實 LINE OAuth／LIFF 登入回傳、通道與配額、實際收件人送達及重試 TTL、台灣18:00明日提醒實機驗收仍未執行。合成加密 entry 只證明應用內連結解析、身分對應與消耗，不等於 LINE Login 成功。
- 店長收款／核帳／退款／月結等 domain 流程有真實 DB 證據，但這輪未把每個帳務視窗都從瀏覽器逐項點完；所有低權限 action 偽造、子店唯讀、技師撤權、跨店 entry、較大資料量與實體 iOS Safari 仍待補驗。
- **外部可開啟測試網址：尚未提供。** 現有 preview 是共用庫，本輪沒有把美業 SQL 放進共用庫，亦未建立可公開連線的獨立 hosted DB。localhost 只供本執行環境使用，不能作為店家手機可開啟網址。hosted build 的本支線 migration／部署守衛保留；Cloudflare 自動建置被守衛拒絕，不宣稱全部 CI 綠燈。
