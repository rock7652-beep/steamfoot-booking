# 音教雲期初結轉：讀取整合與隔離 Preview 里程碑

## 目前可 review 的成果

已從單獨的純契約接入實際課程讀取／服務／動作程式：原期別、原堂序、原價與原效期有獨立期初分支。**服務和動作測試使用虛構資料與 mocks；另已完成核准隔離 PostgreSQL 的 schema／synthetic rollback／實際 reader roundtrip 驗證。Preview 與裝置視覺結果另記，不等於真實來源驗收。**

這不是可營運的整店同步器。一般新增／重排入口對期初卡保持阻擋；切點時預約、待補課或未核對計薪政策也有明確阻擋。尚未寫任何真實匯入器、定時同步或存取授權流程。

需求時間軸維持：台北 2026-10-01 00:00 起的業務事件；10–11 月平行同步並逐項驗收修正，12 月完整對齊，2027 年 1 月切換為目標。音教雲持續作營運主帳。使用者已確認沿用既有 lubymusic 空間，不新增 tenant、不拆母子店、不改既有權限；本輪僅在核准隔離 DB 新增 additive schema 並執行全回滾 synthetic 測試。

## 基準、去重與檔案範圍

第一步基於 main `cd6d80f85c12c2870d16614d696ecc13e563106d`，純契約 79 項及全套 7,182 項測試通過（119 略過）。第二步已在相同獨立 clone 安全快轉至含 #1184 的 main `a404b4715a587090dc099da495413ca5f6d6a157`，原三個檔案完整保留。

已核對 #1133/#1134/#1205/#1227/#1242 已合併，可沿用。#1244 是 HQ 工作視角，不屬此工程。沒有修改其他 checkout、`scripts/ci-migrate.mjs` 或任何既有 migration。

主要程式：
- `src/lib/music-opening-state.ts`：版本 1 資料契約、strict 驗證、來源鍵／內容 SHA-256、批次 create/no-op/conflict 純規劃及明確來源堂序投影。
- `src/lib/music-opening-runtime.ts`：來源標記、店／卡／學員、內容 hash、期別／堂序、日期與一人一堂的共用驗證；不是寫入器。
- `course-prisma/schema.prisma`：CoursePointCard 持久期初標記、獨立 CourseMusicOpeningState、CourseBooking nullable 來源堂次欄位。
- `docs/sql/music-opening-state-draft-20261007.sql`：已核准在隔離 DB 套用的精確 SQL；保留原檔名，仍在 migration 目錄外、無自動執行入口或回填。
- `src/server/queries/course-members.ts`、`course-balance-summary.ts`：期初名單／卡片讀取、堂序、餘額及獨立期初金額摘要。
- `src/server/services/course-booking.ts`：新預約、扣堂、更正／恢復、教師缺席返還的共用守門與效期保護。
- `src/server/services/course-teacher-fee.ts`、`src/lib/course-teacher-fee.ts`：經核對的來源原價路徑與明確待核對；不造購買收款。
- `src/server/reconciliation/course-checks.ts`：期初分支使用切點餘堂減切點後實際扣堂，原生卡保留原核帳算法。
- `src/server/actions/course.ts`、`course-booking-notification.ts`、`course-members.ts`、`src/server/services/course-assignment-checkout.ts`：調課／自助改期、共卡和現成結帳入口防護。
- 後台 roster／card-browser／member-workspace 與顧客 course-portal 的小型資料呈現修正：來源堂序、已處理前綴、未知效期與未開放的新預約入口。

## 期初資料與身份

### 切點／來源鍵

scope 包含版本、targetStoreId、sourceSystem、sourceTenantKey、Asia/Taipei、cutoffBusinessDate。既有 `dayRange()` 把 2026-10-01 轉為 `2026-09-30T16:00:00.000Z`；相等納入，之前拒絕。事件依實際業務日期判斷，不以擷取日、執行日代替。時間戳必須含時區、最多毫秒，正規化不得溢出四位 UTC 年份。

身份是 JSON tuple：版本、目標店、來源系統／租戶、實體種類與穩定來源 ID。姓名、電話、批次 ID 與切點不參與身份；換批次／切點不能偷建第二份期初。內容 hash 包含完整 scope 和狀態，但不包含批次 ID 或 opaque sourceRevision；不猜 revision 大小。同鍵同內容為 NO_OP，改內容為衝突，整批 BLOCKED，不覆寫下游活動。

獨立 DB 草案的 sourceKey 唯一；來源課堂 ID 與原 ordinal 都以店＋卡為 namespace，各有唯一索引。該卡綁定的來源 state 又限定來源系統／租戶／原購買，因此不同來源不會共用一個裸 lesson ID。補課重用 ordinal 不在本版支援範圍。

### 持久來源標記與 fail-closed

`musicOpeningStateRequired=false` 為既有卡預設。標記為 true 但 state 缺漏、state 存在卻未標記、hash／來源鍵／店／卡／學員／SESSION 單位不符，均 BLOCKED，不當成原生卡、不讀今天方案點數／現售價補值。只支援已核對的单人卡；不把期初卡改為共卡。

原生卡與無來源 metadata 的預約走既有算法。原生卡若卻帶来源堂次，名單、扣堂與計薪均拒絕，不退回購買價算法。server 回傳必要投影，不把完整期初 JSON／來源鍵當作新的 client payload。

## 已接入的行為

### 原期別／堂序／堂數

- 每期保留 sourceTermKey、originalTermNumber、totalLessons、closedBeforeCutoff。已處理前綴不是出席、扣堂或舊預約，不建立切點前 CourseBooking。
- 原購買 paidLessons＋giftLessons、已扣堂、切點餘堂、切點預留、待補課分別保存；已處理堂序不等於已扣堂。
- 每筆已映射課堂必須明示來源 term key、原 ordinal 和穩定 source lesson key。原第 7 期第 3 堂不依目標排序重編成第 1 堂；不以 offset 猜非連續歷史。
- roster 的兩種展開日期顯示使用明確 ordinal；前兩堂另標「切點前已處理」，不造日期、不顯示成 ATTENDED，也不補成「尚未排課」。待排 ordinal 以來源期別範圍扣除已處理與已映射堂次取得。
- 同卡重複 source key 或 ordinal 會被讀取核帳判錯，SQL 草案另有唯一索引；教師缺席批次會先核對所有人及重複鍵，再開始任何返還。

### 效期與變更

- 原 activatedAt／expiresAt 不隨切點後首次扣堂重啟，也不因撤銷最後一筆目標扣堂或整堂教師缺席而變成 2099。
- reserveCourseInTransaction、settleCourseBooking、correctCourseAttendance、refundTeacherAbsentSession 使用同一基準。
- 已映射的一人一堂 CARD 支援目前正常點名／曠課扣堂、團班請假扣堂、個別請假不扣堂、更正／恢復與教師缺席返還；仍保留原有權限、expectedStatus、容量與餘额檢查。
- 生效日／到期日未知，或 live card 日期與來源不一致，暫停變更。未知到期日讀取為 null 並顯示待核對，不能把 live 2099 當作來源效期。
- 調課／恢復原時段檢查切點和原到期日；也納入已取消但保留來源的請假／老師缺席歷史，容量計算仍只計未取消者。
- 一般新預約及顧客「取消舊筆再建新筆」改期仍阻擋，避免新筆掉失來源堂次。沒有開放從 client 自填來源欄位。

### 金額與教師費

- 期初原總價、約定學費、切點前已收、期初應收分開；期初金額顯示在獨立摘要，不塞入真實收款 termPayment。
- 已知原價時應付高於原價、不能平衡的應收已收均拒絕。淨額本身不能證明無退款／溢收／額外費用；來源 adapter 必須辨識這些未支援類型。
- 現成結帳入口拒絕期初 metadata；不建立 CONFIRMED 購買、舊 CashbookEntry、GRANT、薪資或假出席來支撐原價。
- readTeacherFeeSeats 的期初路徑與購買路徑互斥：期初卡連結購買收款、未知原單堂價或原總價不符，均待核對。
- teacherFeePolicy 預設 UNVERIFIED；只有未來另經來源規則核對的 MUSIC_V2_ORIGINAL_PRICE 才可用該價基。synthetic fixture 中的已核對值僅為測試，不代表來源規則已驗收。
- HOUR、來源折扣／未繳清政策、贈課計薪、扣薪／獎勵與舊計算版本不擅自推定；未知結果是 null＋issue，不是零薪。老師未授課仍保留既有零薪規則。

### 核帳、餘額與庫存界線

- 原生 card_checks 保留既有算法；新期初核帳以 remainingAtCutoff 減 ATTENDED／NO_SHOW／GROUP_LEAVE_FORFEITED 的當前扣堂狀態核對，恢復後即不再列入扣堂，不需製造 GRANT。
- 期初分支同時檢查來源映射、重複鍵、live 效期／學員、可用／預留與混入購買／GRANT／退款／VOID 的異常；發現問題只報 mismatch，不修正數字。
- getCourseCards 與整體餘額摘要沿用同一投影；live RESERVED 只計一次，不把 reservedAtCutoff 再疊加。
- 庫存仍只有第一步契約：切點存量、預留、庫位／批號與精確 Decimal(18,6) 成本字串。不寫入進銷存，不重演採購、銷貨、入庫、盤點、付款；未知成本仍為 null。

## 刻意保留的阻擋與下一步

1. **尚無來源匯入器。** 一般入口不能新建期初卡預約；無例外參數或密碼捷徑。後續需要經核對的原堂次與事件映射，再設計安全 importer。
2. **reservedAtCutoff > 0 或 unresolvedMakeupLessons > 0 暫停所有變更。** 本版未建立「來源預留／補課已對齊」狀態，因此這些卡不會自行解鎖。可顯示已知原堂序，但不能宣稱可營運。
3. 跨切點補課、非連續堂序、轉堂／退堂／逾期註銷、分次收款／退款、非整數或逐期不同價、鐘點與獎懲仍需來源規則及會計證據；不得改數字讓驗證通過。期初卡的下期續購／跨期付款來源關聯尚未接入，不以目標建卡日猜下期；新舊客等分析與整店來源報表的完全一致也尚未驗證。
4. Future importer 必須在同一 DB 交易內建立期初 state、卡投影、全部來源映射與批次稽核，驗證 hash／穩定 ID／學員／原價／效期，再設定持久標記；重跑應使用唯一鍵及 compare-and-swap。沒有實作這個 writer，沒有證明真實 exactly-once、並發、回滾或來源差量更正。
5. 期初 row 的不變性目前由沒有修改入口與來源衝突規則約束；DB 級別不可變更 trigger／更正流程尚未定案，不能宣稱已完成持久化防竄改。
6. **僅可發布已護欄的 exact branch Preview。** 隔離 schema 已依限定核准套用，build/runtime 對錯環境／缺 schema 必須拒絕。正式部署仍未開放，詳見 [發布門檻](music-opening-release-gates-20261007.md)。
7. 真實來源傳輸、production DB、merge、正式切換仍不在本輪範圍。隔離 schema 與 synthetic 驗收不代替來源規則核對。

## 本機驗證紀錄

- Prisma validate 與 generate 通過；使用 127.0.0.1:1 的無效占位 URL 僅滿足 schema env，不連接或寫入 DB。
- 獨立設計／程式審查已修正來源遺失誤判原生、特殊扣堂、native fee fallback、已取消來源課堂調課、未知效期顯示及重複 ordinal 等缺口。
- 新增 runtime、實際 service、read、teacher-action、calendar-action 與 schema contract 測試，全部採 synthetic fixtures／mocked Prisma。新增 PGlite PostgreSQL 與真實隔離 PostgreSQL rollback 驗證，涵蓋約束與 reader roundtrip。UI assertion 只檢查資料呈現程式，不是瀏覽器／裝置驗收。
- 最終期初專屬 156 項測試通過；另新增團班／個別課兩組 jsdom 呈現情境，既有原生 roster payload 的向下相容也已回歸。
- 完整 Vitest：851 檔通過、16 檔略過；7,340 項通過、119 項略過，0 失敗。既有 b7-4-5 巢狀 vi.mock 警告未擴修。
- 完整 TypeScript（4GB heap）、所有修改 TS／TSX 檔 ESLint 與 git diff --check 通過。首輪全套曾發現兩個原生舊 payload 缺新欄位的呈現失敗，已修復並整套重跑成功。
- 本機沒有執行連 DB 的 production build；獨立 Preview build/CI 於發布後核對。無環境密鑰複製、真實來源傳輸、main 合併或正式部署。
