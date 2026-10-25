# 音樂期初第二里程碑：發布阻擋、精確 DDL 與下一步核准範圍

狀態：使用者已核准隔離 schema、synthetic 驗收及獨立 Draft PR／Preview；隔離 DDL 與 synthetic DB 驗證已完成。仍禁止 main 合併、正式部署與真實資料傳輸。

功能基準 main：`a404b4715a587090dc099da495413ca5f6d6a157`。
本機 branch：`feat/music-opening-state-20261007`。
擬議的新遠端 branch：`feat/music-opening-state-20261007`，尚未建立；最终名稱必須與所有 guard 的精確名稱一致。
沿用現有 lubymusic，保留 tenant／母子店及既有權限。不借用已合併 #1184 或獨立 #1244，也不混入它們的 ci-migrate 變更。

## 1. 精確資料表／欄位變更

| 物件 | 新增內容 | 預設／約束 | 既有資料影響 |
|---|---|---|---|
| CoursePointCard | musicOpeningStateRequired boolean | NOT NULL DEFAULT false | 原生卡預設 false，不回填其他資料 |
| CoursePointCard Prisma relation | musicOpeningState | optional 1:1 relation | relation 不是實際欄位 |
| CourseBooking | musicOpeningTermKey text | nullable | 舊預約保持 null |
| CourseBooking | musicOpeningLessonOrdinal integer | nullable；有來源時 1–100000 | 舊預約保持 null |
| CourseBooking | musicOpeningSourceLessonKey text | nullable | 舊預約保持 null |
| CourseBooking constraint | CourseBooking_opening_identity_complete | 三個來源欄位全部 null，或全部完整且 cardId/customerId 非 null | 不造舊出席／預約 |
| CourseBooking unique index | CourseBooking_opening_source_key | storeId + cardId + source lesson key | 普通 null 欄位不占來源身份 |
| CourseBooking unique index | CourseBooking_opening_ordinal_key | storeId + cardId + source term key + ordinal | 同卡原堂序不重複；特殊補課重用尚未支援 |
| CourseMusicOpeningState | 新增獨立表，初始為空 | 下列欄位與限制 | 不建立任何真實期初 row |

CourseMusicOpeningState 精確欄位：
- id text，primary key；Prisma 使用 cuid；SQL 不自行生成來源資料
- storeId text NOT NULL，FK Store(id)，RESTRICT
- cardId text NOT NULL，與 storeId 合併唯一，FK CoursePointCard(id, storeId)，RESTRICT
- customerId text NOT NULL，FK Customer(id, storeId)，以及 CourseCardMember(cardId, customerId)，RESTRICT
- sourceKey text NOT NULL UNIQUE；內容為已驗證的來源 namespace tuple
- contentHash text NOT NULL，64 位小寫十六進位檢查
- snapshot jsonb NOT NULL，必須是 JSON object；完整欄位、hash、來源與目标關聯由 runtime 再驗證
- appliedBatchId text NOT NULL，非空白批次身份
- teacherFeePolicy text NOT NULL DEFAULT UNVERIFIED，只接受 UNVERIFIED / MUSIC_V2_ORIGINAL_PRICE
- createdAt timestamptz(3) NOT NULL DEFAULT now()
- 次要 index：storeId + customerId

本次沒有改 Store、Customer、CoursePurchase、CashbookEntry、薪資、進銷存或來源資料值；新 FK 只引用既有 key。

## 2. 已核准並完成的隔離 DDL

使用者已核准僅 steamfoot-preview 的一份 additive schema、synthetic 驗收，以及同 repo 獨立 Draft PR／Preview。正式 main、production、真實來源資料不在核准範圍。

- 精確 SQL：`docs/sql/music-opening-state-draft-20261007.sql`（保留原草案檔名作可追溯證據）
- 隔離 Supabase project：`ttworfzgwejdeolegkxl`，已核對 ACTIVE_HEALTHY、既有 store-lubymusic／lubymusic／COURSE
- migration：`20261007103113_music_opening_state_isolated_20261007`
- SQL SHA-256：`4bdd5ff53fc096340b00426c4fc42062331e72a854e2ae64c1aab5d67c14efa3`
- 2026-10-07 10:31 UTC，Supabase apply_migration 成功；未執行其他 pending migrations
- 單一交易，lock_timeout 5 秒／statement_timeout 30 秒；目標店、物件尚未存在先決檢查，不用 IF NOT EXISTS 掩蓋部分 schema
- additive 新空表＋一個 false flag＋三個 nullable 欄；無回填、無業務交易
- 同店／卡／學員 membership FK、唯一來源和 ordinal、完整性 CHECK；新表 RLS enabled、PUBLIC／anon／authenticated 全權限撤銷、無 client policies
- owner/bypassRLS 仍可讀寫，沒有 FORCE RLS；此為既有 server-only 架構，不宣稱 owner 也受 client RLS 限制
- 未核實隔離 DB 備份 ID。本階段採原 schema/count/digest 記錄、單交易失敗回滾、成功後保留未使用 additive schema 的 code rollback；未宣稱有完整 backup restore 演練

DDL 前後舊 CoursePointCard 199 筆、CourseBooking 12,739 筆完全相同。扣除新欄位後的原資料 ordered-JSON MD5 分別為 `ce315804c555e03662b746632c653e29`／`1a87f4a473149a2fee1a6764b39adf1e`，前後一致。期初表 0 筆、旗標 true 0 筆、來源映射 booking 0 筆。既有 tenant parent 保留。

## 3. 已實作的 fail-closed 護欄

- `scripts/music-opening-preview-scope.mjs` 固定 exact branch、repo owner/name、VERCEL_ENV=preview，以及兩條連線都必須是核准隔離 project。缺 metadata／非 preview／錯一條 URL 都拒絕；僅允許已知連線選項且不可重複，拒絕 host/options override、非 public schema、未知 query key 及非標準 port；錯誤不輸出連線字串。
- `scripts/music-opening-preflight.mjs` 在 package build 最前執行，先於未修改的 ci-migrate、client generate、Next build。現有 ci-migrate 在本 branch 不跑 migration；不將 opening SQL 放入其自動流程。
- `scripts/music-opening-schema-check.mjs` 只讀查實際 catalog：columns/types/nullability/defaults、兩個 booking unique 和 state unique、4 個 FK、validated CHECK、RLS／client privileges／policies、目標店。任一不符，整個 build/startup 拒絕。
- 三個 DB client constructor 都先跑 runtime scope guard；Next instrumentation register 在 Node server readiness 前等待同一實際 schema preflight。測試 bypass 只允許非 Vercel 的 NODE_ENV=test，不是部署開關。
- vercel.json 明確 buildCommand=npm run build，exact branch deploymentEnabled=false，其他 branch 和 cron 設定不變。首個遠端 commit 必須同時含完整 guard；schema ready 後另明確啟動指定 commit 的 Preview。
- 現有 Preview outbound 防護維持；Vercel 排程只在 production 啟動，部分 cron route 仍可在隔離 DB 內變更資料，因此本輪不手動帶 CRON_SECRET 呼叫任何 cron；本輪不發送通知、不新增 provider 設定、不解密／複製／配置任何 credentials。

URL allowlist／Prisma generate 不是實際 schema 驗收。此輪已另用真實隔離 DB catalog 執行 capability check，全項通過；Vercel 真正的 build/startup 仍須在 exact commit 驗證。不能退回 production URL，也不能吞掉缺欄錯誤後繼續服務。

## 4. 已完成的 synthetic 驗收

- 本機 PGlite 實際 PostgreSQL：DDL、schema capability、來源／ordinal 唯一、CHECK、FK、RLS 權限和失敗回滾。
- 真實隔離 PostgreSQL：`docs/sql/music-opening-synthetic-rollback-20261007.sql`，所有 fixture 只在 store-lubymusic 且無真實姓名／聯絡資料。使用內層 exception subtransaction 故意 rollback；既有 operator/teacher 只在 DB 內引用，沒有輸出身份。
- DB 已證明重複來源 key、重複原 ordinal、缺 ordinal、跨店 FK 均拒絕；沒有 CoursePurchase 或 CoursePointEntry。
- 真實 DB roundtrip 再經 actual TypeScript readers：仍原第 7 期第 3 堂、原單價 800、原啟用 2026-09-15、原到期 2026-11-30；前兩堂只有已處理前綴。teacherFeePolicy=UNVERIFIED，不能因此付款。
- transaction fixture 全數撤銷後期初表仍 0、卡 199、預約 12,739。沒有留任何開口供通知；DB 觸發器活動也隨同回滾。
- 最終本機完整 Vitest：851 檔通過／16 略過，7,340 項通過／119 略過，0 失敗；TypeScript、ESLint、Prisma validate/generate、diff check 已通過。

這些證據不等於來源資料驗收、真正 importer 併發驗收或桌機／iPad／手機視覺驗收。service/actions 測試仍為 mocked Prisma；synthetic SQL 只驗 schema 與 roundtrip，不宣稱實際 UI 已點名結帳。

## 5. 發布與尚待門檻

本機 branch 與核准遠端 branch 均 `feat/music-opening-state-20261007`，以 main a404b471 為基底，不混 #1244 或共卡 patch。

1. 獨立 review release guard 與精確檔案集，再建立直接指向完整 guarded commit 的新 branch；不可先建立指向未受保護 main 的 branch。
2. 建立 Draft PR，保持未合併；讀回遠端 blob/tree 與本機 exact head 一致。
3. 使用既有 Vercel Git connection 啟動 exact commit 的手動 Preview；沿用現存 preview credentials，不建立 key、不改 persistent access。
4. 持續核對 exact commit 的 CI、build guard log、Preview READY 與 runtime schema guard；任何錯誤先 fail-closed，再在授權範圍修復。
5. 實際桌機／iPad／手機視覺和已映射期初交易 UI 驗收須分開列明結果。若只有本機 DOM＋DB roundtrip，不能寫成完整產品驗收。
6. 來源預約／補課、續購／付款、鐘點計薪與整店分析／庫存對照、真實來源傳輸、正式 DB 和 2027 切換仍未開放。

## 6. 回滾策略

- DDL 交易內任何一步失敗：ROLLBACK；先確認沒有部分物件。不要自動重試、跳過錯誤或一口氣套其他 migration。
- DDL 成功但尚未新增 opening data：最安全的應用回退是回到已核實的舊 Preview，保留未使用的 additive schema；其他舊程式仍用 false/null 的原生資料。不急著 DROP。
- 若確實要撤除 schema：需要另行核准的 down migration，先證明 opening 表為空、所有 required flag=false、所有來源 lesson 欄均 null、沒有 code/dependency 使用；再核對 migration ledger。不自動刪資料或猜測可回復。
- 一旦有任何期初卡或已映射 booking，不能直接回退到不懂期初的舊程式恢復營運。先停止這些卡的寫入／隔離本次資料，保留 snapshot/鍵/對照，優先修正新版本或依已核准備份策略恢復。
- 回滾 Preview 不等於還原 DB，撤銷 deployment 不等於撤銷收款／扣堂。此輪沒有任何真實資料可退。

## 7. 仍須另行決策的範圍

本次授權已覆蓋限定隔離 DDL、synthetic 測試、独立 Draft PR／Preview，無需為同一個本機修正重複確認。真實來源匯出／傳輸須另確認資料欄位、來源、接收 DB/store 與目的；正式 merge/deploy、拆 tenant、存取擴權、來源薪資政策和未支援的業務語意都未授權。

Draft 只是 review/隔離 Preview 里程碑。完整整店同步、10–11 月平行驗收、12 月一致、2027 年 1 月切換仍是後續目標，不能由本輪測試通過推稱已完成。
