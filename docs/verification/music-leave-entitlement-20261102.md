# 音樂請假與手動改期限：本機修復驗證（2026-11-02）

## 來源、授權與版本

- 接續者：本次 Codex 工作階段；原 PR 作者均為 `rock7652-beep`。
- 原討論：[#1466](https://github.com/rock7652-beep/steamfoot-booking/pull/1466#discussion_r4415027855)、[#1468](https://github.com/rock7652-beep/steamfoot-booking/pull/1468#discussion_r4419898834)，兩 PR 已合併；不是因 review 尚未解決就認定未實作。
- 開始與交付前重新核對 remote main：`9cf3a5e92d19dce57ac2beb9273f6a9f7a2108cf`。起始工作樹乾淨。本機分支 `fix/music-leave-entitlement-20261102`。
- 已檢視全部 15 個 open PR；未見本次兩項風險的活躍修復。#1469 是名單可用餘額，#1459 是項目權益與購買同步，未直接改本次兩段條件。遠端 `review/plan-management-sports-performance` 相對 pinned main 為落後且 ahead=0，沒有另行重複開發的未合併成果。
- 使用者直接同意隔離重現、針對性修正及回歸；本次只做本機。沒有 push、PR、Preview、merge、正式部署／migration、正式學員操作、外部訊息或排程。
- 已讀 AGENTS.md、task-handoff 與 release-check Skills。沒有 UI 改動；Cloudflare 不是本次本機服務交易的依賴。

## 因果與修正

### A：已購買適用方案，但自動排課仍為 UNPAID／cardId=null

原版 `settleCourseBooking` 只在 ATTENDED／NO_SHOW 做音樂項目綁卡。STUDENT_LEAVE 因此未讀到方案，漏掉適用方案的原生扣堂與獨立補課權益。

修正只讓尚為 RESERVED 的後台 STUDENT_LEAVE 沿用既有 `bindMusicAttendanceCard`，保留項目、期限、保留量、先買先扣及期別檢查，再按既有政策結算。已取消的無卡請假重送不會因後來買卡而追扣。無卡、不適用、到期、額度已保留與非音樂維持原行為。沒有改會員自行請假的權限或截止時間規則。

### B：手動改期限抹去原生音樂政策身分

`manageCourseCard` 將 `musicValidityDays` 清為 null，目的是讓店長核對的固定期限優先，防止首次使用／恢復重算日期；這項行為應保留。但原生請假資格也依此欄位辨識，導致既有補課失去來源資格，未來請假亦可能誤用舊政策。

修正 `isNativeMusicLeaveCard`：欄位為空時，僅接受相同 store、CoursePointCard target 與 card ID 的 CARD_EXPIRY 不可變 audit，其 beforeJson 必須保留正數型別的 musicValidityDays；仍須恰有一筆未作廢且已確認時間的 CONFIRMED 購買。跨店／其他卡／其他 target、字串／null／零的歷史值與已作廢購買不能通過。既有 yjy／補課卡前綴與原生流程啟用檢查保持原樣。不需要 schema 變更，也可辨識本次修正前已經完成的合法手動調整。

手動期限仍為權威日期，不恢復相對效期、不偽造啟用時間、不改原購課金額或帳務。既有管理服務原本不更新已發補課券，補課券保存發放時的 expiresAt；本次維持這個實作，不自行新增「改原卡日期就同步補課券」的規則。補課仍檢查自身期限與原請假時間；新請假依當下原卡期限發新權益。

## 隔離與驗證

- 所有案例使用合成資料。實際 SQL 在既有本機 PostgreSQL 16 Docker 中新建 `steamfoot_music_20261102_test`，測試 URL 經既有 helper 強制 loopback 且 DB 名稱以 `_test` 結尾。測試各用隨機 schema，逐筆清除本次 local OperationAuditOutbox，結束移除 schema；測試後移除此新建 DB。
- 原生 capability 在測試限定啟用，門市通知服務以 mock 阻擋；沒有 delivery worker。不是正式／雲端隔離店驗收。
- 新增 PostgreSQL 套件採實際 Prisma 交易、store lock、原生方案／購買／期別表、AuditLog SQL、補課預約服務與重送收據；採真正期別表及 unique indexes。沒有把部署專用期別 trigger／RLS 或正常登入 UI 列為已驗。
- 修改前的合成服務測試：18 項中 5 項失敗（未綁方案請假、縮短／延長後來源辨識、過期補課被錯誤來源驗證先阻擋、未來請假不發補課）。保留失敗紀錄於本機 `/tmp/music-red.log`。
- 在乾淨 pinned-main 工作樹放入同一份新 PG 測試：4 項中 3 項失敗、1 項通過（未產生補課券與手動期限後無法辨識原生資格）；修正分支 4 項全部通過。紀錄 `/tmp/music-pg-baseline-red.log`、`/tmp/music-pg-final.log`。
- 最終聚焦：`BOOKING_CONCURRENCY_TEST_DATABASE_URL=<guarded-loopback-test-url> npx vitest run` 加上 music-native-leave、music-leave-entitlement.pg、plan-card-management.pg、course-student-makeup.pg、music-item-cards、music-operational-pilot-policy、music-student-makeups、music-period-card-eligibility、music-roster-attendance 九檔及 `--maxWorkers=1`，**9 檔／63 項通過，無略過**。紀錄 `/tmp/music-focused-final.log`。
- 既有 workflow makeup 步驟同樣命令及 JSON gate 在本機執行：**兩檔／8 項通過，無略過**；以 workflow YAML 解析出的原 gate script 驗證 JSON 通過。YAML 以既有 js-yaml 解析通過。紀錄 `/tmp/music-workflow-step.log`、`/tmp/music-makeup-pg-results.json`。
- 最終變更的四個 TypeScript 檔 ESLint 通過，`git diff --check` 通過。最終 `npx tsc --noEmit` 通過（exit 0），紀錄 `/tmp/music-tsc-final.log`。
- 全量 `npx vitest run --maxWorkers=2`：**1,590 檔通過、3 檔失敗、30 檔略過（共 1,623 檔）；15,265 項通過、264 項略過**，exit 1。僅上列已在乾淨 main 重現的三個通知初始化失敗，不能宣稱全量通過。業務修正邏輯與此輪全量相同；全量啟動時尚未加入的新 PG 檔，另以明確 loopback DB 實跑 4 項全部通過，最終新增／調整測試以九檔 63 項結果為準。紀錄 `/tmp/music-full.log`。
- `npm run build`／Preview／登入後 UI／正式資料交易均未執行；build script 會進入 preflight 與 migration 流程，不拿本機測試當部署驗收。沒有修改操作指南，後台操作步驟未改。
- 3 個通知 suite 在乾淨 `9cf3a5e9` 工作樹單獨重現初始化失敗（7 項未執行）：`beauty-combined-notices.test.ts`、`course-combined-notices.test.ts`、`steamfoot-combined-notices.test.ts`。原因是 `CourseStoreNotice`／`SteamfootStoreNotice.publishedAt` 被 fixture 重複 ADD COLUMN。沒有修本次範圍外的通知程式或 fixture。紀錄 `/tmp/music-main-baseline-failures.log`。
- 新 PostgreSQL 套件加入既有 `music-makeup-audit` 的同一工作步驟，與原四案串行執行，總計九案且 gate 要求無略過（審查階段補一案並發）；沒有新 job、服務或部署。

## 費用與下一步界線

目前只使用既有本機依賴與 PostgreSQL，沒有新付費工具、映像下載或雲端建置。

已唯讀檢查 GitHub CI、makeup audit workflow 與 vercel.json。本修復分支不在 Vercel 的逐支停建名單；push／開 PR 可能觸發 Preview／GitHub checks，不能視為零費用，沒有平台用量／費率可估算金額。本次不 push，也未為放行改部署或預算設定。

其他 PR 的 Preview 對應不同應用 SHA，無法驗證本次未推送修復；可重用其已核實的隔離基礎設施，不可把舊 Preview 通過當成本版驗收。必要的後續最小步驟是先確認單一分支自動建置成本與隔離雙連線／通知封鎖，再集中一次 push／Draft PR，由現有自動流程產生精確版本 Preview，不另手動重建。上述建置／推送尚待父線決策與需要的補授權，沒有執行，也不是工具拒絕。

下一步：由父線審查本機 diff、測試與成本界線，再承接必要的推送／隔離登入驗收授權；不自行合併或正式上線。


## 獨立內容審查補記

父線明確要求等待推送批准期間做獨立本機審查；已由另一 reviewer `/root/review_music_entitlements` 唯讀審查 `ba31303e`，執行者亦另讀交易／權限入口。**未發現業務差異的新阻擋問題**，沒有新增業務規則或修改原生資格判斷程式。

精簡業務 diff：`course-booking.ts:500` 將尚為 RESERVED 的後台 STUDENT_LEAVE 納入既有音樂綁卡；`music-native-leave.ts:16–25` 在相對效期空值時查同店同卡期限 audit，再維持原已確認購買檢查。

實際改動檔清單（相對 pinned main，共六檔）：

| 檔案 | 用途 |
| --- | --- |
| `src/server/services/course-booking.ts` | 未綁卡請假先選既有適用方案，已結算重送不追扣 |
| `src/server/services/music-native-leave.ts` | 從合法期限調整歷史保留原生政策身分 |
| `src/__tests__/music-native-leave.test.ts` | 合成服務生命週期及缺卡／不適用／期限／重送案例 |
| `src/__tests__/music-leave-entitlement.pg.test.ts` | 真實 PostgreSQL 交易、來源邊界、回滾與並發 |
| `.github/workflows/music-makeup-audit.yml` | 既有隔離 PG 步驟加入新案例，gate 更新為九案無略過 |
| `docs/verification/music-leave-entitlement-20261102.md` | 本機成果、證據、審查與限制 |

核對結果：

- `CARD_EXPIRY` 課程寫入來源是 `planManagementCommand`；beforeJson 由 DB card 建立，與期限調整及 receipt 同交易。入口 `saveCourseCardManagement:16–25` 保留 wallet.adjust、customer.read、wallet.read、同店、全員可管理及 feature 檢查；此 diff 沒有新增任何可由前端寫 proof 的入口。
- proof 查詢限定 store／targetType／card ID／action／JSON number > 0；再要求同店同卡恰一筆未作廢、confirmedAt 非空的 CONFIRMED 購買。不把 audit 當操作授權。
- 缺 proof 時回 false：**既有補課來源驗證會拒絕；普通請假仍走原 legacy 政策，不是所有缺資料都明示阻擋**。SQL 讀取錯誤會拋錯並回滾，沒有吞錯放行。
- `manageCourseCard:28` 仍清除相對天數，手動期限保持權威；此 diff 不寫既有補課券 expiresAt。再次調整的 beforeJson 雖已為 null，仍能查到第一筆合法原生歷史。
- `courseTransaction:135` 先鎖店家 `Store FOR UPDATE`，未綁卡請假重送先讀已取消狀態，不會重綁／扣堂／發券；已結算無卡後購方案也不會追扣。

審查補驗：在獨立新建的 loopback `steamfoot_music_review_20261102_test`，新增「同預約兩個同時請假請求」案例，確認僅一次 RESERVE、一次 DEBIT、一張補課卡及一次 GRANT。新 PG 套件 **5 項通過**；與原套件合跑 **兩檔／9 項通過，無略過**，workflow 原九案 gate 亦通過。紀錄 `/tmp/music-review-pg.log`、`/tmp/music-makeup-review-pg-results.json`。原九檔／63 項紀錄保留，沒有為審查重跑全量。

追加測試後 TypeScript、四個變更 TS 檔 ESLint、YAML 解析與 diff 檢查均通過；另跑 `course-card-management-access.test.ts` 保護原後端入口權限。紀錄 `/tmp/music-review-tsc.log`、`/tmp/music-review-lint.log`、`/tmp/music-review-access.log`。

乾淨 main 證據：以 `git worktree add --detach /tmp/steamfoot-music-baseline 9cf3a5e92d19dce57ac2beb9273f6a9f7a2108cf` 建立原始 worktree，連結既有依賴／generated clients 後直接執行三個原通知測試（先於放入任何新 PG 測試）；結果 **3 suites 失敗、7 項略過**，與本次全量相同。確切失敗：

- `src/__tests__/beauty-combined-notices.test.ts`：`CourseStoreNotice.publishedAt` already exists。
- `src/__tests__/course-combined-notices.test.ts`：`CourseStoreNotice.publishedAt` already exists。
- `src/__tests__/steamfoot-combined-notices.test.ts`：`SteamfootStoreNotice.publishedAt` already exists。

原始日誌 `/tmp/music-main-baseline-failures.log` 第 10–14／26–29 行保存錯誤，42–46 行保存結果；三個檔案不在本次 diff。乾淨 worktree 已移除。審查不取代真實角色登入、hosted、部署專用 trigger／RLS 或正式發布驗收；維持不推送、不建預覽，等待父線既定批准。

下一步：由父線審查追加測試與獨立審查紀錄，承接既有推送／建置批准；本機不再擴大修改。


## 完整 SQL guard 串接與補課再次請假補驗

本輪依父線指示僅做本機：既有 Preview scope、平台 env／保護、應用帳號皆未改；不 push、不建置。遠端 PR #1482 head 仍為 `d0666d53`，下列本機修正尚未上傳，舊 CI 不抵扣本版。

在一次性 loopback PostgreSQL 16 容器的新 `music_guard_test`，把本次 PG fixture 換成 `scripts/music-production-expand.sql` 的真正 assignment table／indexes、guard／release trigger、function revoke。僅將 public namespace 替換為隨機測試 schema；再套用該 assignment 表的 production RLS／table revoke。沒有改 deployment SQL 或任何遠端資料庫。anon／authenticated 只在一次性容器內存在，隨容器移除，不是新增隔離站應用帳號。

這次補驗發現原測試未覆蓋的同根缺口：補課再次請假後，canonical release trigger 對 CANCELLED＋STUDENT_LEAVE 保留舊 MAKEUP assignment，合法再預約會碰到 `MusicLesson_active_makeup` 唯一約束。縮短／延長兩案均重現 `23505`；原普通堂次 allocation 應保留，當次補課 allocation 則應釋放。原失敗紀錄 `/tmp/music-guard-red-20261102.log`。

獨立 reviewer 另指出名單 UI 的 WAIVED 實際走 `correctMusicRosterAttendance`→`correctCourseAttendance`，不只 settle 路徑。已用真實 action 實作＋Prisma 交易＋SQL triggers 重現 WAIVED 成功但 releasedAt 仍 null（權限 actor 與 Next refresh stub；不是正常登入）。失敗紀錄 `/tmp/music-roster-guard-red-20261102.log`。

最小修正僅在 `course-booking.ts`：

- 原生獨立補課成功請假／取消後，沿既有 `releaseMusicLesson` 釋放當次 booking 的 allocation；覆蓋 settle 與 correction 兩入口。原普通堂次、補課券餘額／期限與 GRANT 不被改寫，也不刪資料庫約束。
- correction 對已確認相同取消狀態的補課重送直接返回，不更新 booking／ledger，避免 booking trigger 再把舊 allocation 啟用。先保留 closedAt、狀態及 expectedStatus 驗證。
- 釋放與原狀態／ledger 在同一交易，後續 ledger 拒絕時全部回滾。已有新預約時，恢復舊預約仍被 held 額度與唯一約束保護。

新增證據：原方案縮短／延長後，補課請假→保留同一權益→合法再預約的並發重送；真實名單 WAIVED action→再預約→舊 WAIVED 重送不新增 ledger→恢復舊課被拒；額外強制 ledger 失敗證明取消及 release 一起回滾；真 guard 拒絕越界期別及刪歷史；anon／authenticated table／function 權限拒絕且 RLS 已啟用，暫授 SELECT 仍無可見行（授權在測試交易回滾）。

最終驗證：

- **11 檔／79 項通過**，含新 PG 八案、原補課四案、方案管理 PG、action 權限、原生／pilot 服務與 period guard；`/tmp/music-complete-guard-focused-20261102.log`。
- 既有 makeup workflow 兩檔 **12 項通過，無略過**；YAML gate 從九改十二並以原 script 核 JSON 通過。沒有新增 job 或雲端執行；`/tmp/music-complete-guard-workflow-20261102.log`、同名 JSON。
- TypeScript、變更 TS ESLint、YAML／diff 檢查通過；`/tmp/music-complete-guard-tsc-20261102.log`、`/tmp/music-complete-guard-lint-20261102.log`。
- 另一 reviewer 複審新 service diff，未再發現明確新增阻擋問題。依要求未重跑全量；此前全量三個 baseline 失敗的證據只屬先前版本，不能宣稱本 head 全量已驗。

限制：這是新增成功 transition 的修復，不會自動清理部署前已取消卻未釋放的資料；重送早退也不會修復該歷史狀態。沒有正式學員受影響證據，沒有回填。hosted 角色登入、精確部署的 runtime gate 與現有資料庫 readiness 仍未驗。

因此可縮減 hosted 至：一個僅本隔離店正常授權角色，從方案管理調期限及原生補課入口預約，再用名單「請假／WAIVED」並合法重約，重新載入確認結果；另確認未綁卡 STUDENT_LEAVE 實際使用的呼叫入口，不能用語義為免扣堂的 WAIVED 當作同一政策驗收。無須在線上重跑全部並發壓力、帳本故障注入或 UI 尺寸矩陣；這些交易邊界已有本機真 SQL 證據。hosted 最小入口仍須正常身分與精確版隔離環境，不冒用舊 Preview。

下一步：父線核對本機新 head 與補驗證據，安排已獲確認範圍的後續階段；本輪不推送、不啟用預覽。

## 已批准精確 Preview scope：本機備妥，連線／登入尚缺

本人已直接同意最小受限 Preview 方案，父線已核實該批准，不需重問同一批准。本輪在 `22d393f8` 上準備新的本機 scope／反例；仍未 push，未修改平台 env、SSO、分享、預算或應用帳號。

- 僅在 `scripts/sports-shared-card-preview-scope.mjs` exact allowlist 與 `scripts/music-native-workflow-scope.mjs` integration array 加入 `fix/music-leave-entitlement-20261102`；仍限 Preview、原 repo、`store-lubymusic`、雙隔離 URL，排除其他 provider。不改 production main、其他店、原生 release 或歷史 importer 資格。
- 先測新正例失敗三項，修改後五檔 **97 項通過**；另 `node --test scripts/music-native-workflow-scope.test.mjs` **4 項通過**。測試含正式／混合連線、錯 repo、相似分支與 provider metadata 拒絕，並用既有 Prisma／subprocess tripwire 證明 migration dispatcher 不做 DB／migration。四個變更 JS／TS 檔 ESLint、TypeScript、diff 通過。紀錄 `/tmp/music-preview-scope-red-20261102.log`、`/tmp/music-preview-scope-green-20261102.log`、`/tmp/music-preview-native-node-20261102.log`、`/tmp/music-preview-scope-lint-20261102.log`、`/tmp/music-preview-scope-tsc-20261102.log`。
- 另一 reviewer 唯讀快審未發現新增擴權／繞 gate 問題。這不代表 Preview 已可建置或可登入。

阻擋（不是追加批准問題）：Vercel 原 project `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR` 的通用 Preview `DATABASE_URL`（env ID `n9GgF0K3wpdb1B2R`）與 `DIRECT_URL`（`d4sWjrCWSSpV35DS`）都是 sensitive。既有整合分支只列功能旗標，沒有它自己的 DB override；讀取上述兩筆只取得 metadata，回應 decrypted=false、未提供 value。不是 403／auto-review 拒絕，但沒有可用值可逐條驗證及建立本分支變數。本機目前只找到 `.env.example`，DATABASE_URL、DIRECT_URL、SPORTS_PERF_ENV_DIR 亦未注入。沒有解碼密文、改 sensitive 類型或換來源繞保護；未建立兩筆新變數，也未使用未驗證的預設連線建置。

可獨立完成的隔離證據：透過 Supabase project API 明確指定已核准 ref `ttworfzgwejdeolegkxl`，確認名稱 steamfoot-preview、ACTIVE_HEALTHY、DB host=db.ttworfzgwejdeolegkxl.supabase.co；未呼叫正式 project。隨後僅查該 project 的 metadata：store-lubymusic ACTIVE／TRIAL 且 business.music 啟用，兩個 assignment triggers 均啟用且非 SECURITY DEFINER，兩個必要 indexes 存在，assignment RLS 開啟、anon／authenticated 均無表讀寫權限。沒有查顧客或建立測試帳號。

現有 Preview guard body MD5 `768e23b82b7eac3f7f0dbfd6a7829074`、release body MD5 `46fe6e73eb29cca414cec99ee7ac7f9a`，逐一吻合 repo 的 `scripts/music-fixed-periods.sql`；release 也吻合 production SQL。Preview guard 保留 archive guard，與 production guard（MD5 `53a2251f06d94a2cf79e28b7bceb7c85`）不是同一版本；Preview 的 trigger 函數 EXECUTE 權限仍為 true，與 production 腳本 revoke 不同。沒有改 schema 或權限，也不把上述 metadata 說成 production schema 已完整一致。此證據不能替代兩筆實際 URL 的安全檢查。

登入亦尚未具備：執行環境沒有 VERCEL_OIDC_TOKEN／VERCEL_TOKEN／既有 automation bypass；可用的是免費本機 Playwright／Chromium，未確認有合法 Vercel SSO 工作階段。Vercel web_fetch 工具會建立／重用 23 小時分享，與本次「不分享」限制衝突，因此沒有呼叫。沒有啟用新的 bypass、公開連結或付費瀏覽器工具，沒有先建立無法使用的應用帳號。

最小解法：由父線提供已獲授權的隔離雙連線安全來源（例如僅告知受控 secret 檔路徑／注入環境，不把值貼聊天或提交 Git），供受控程序驗兩個既有 URL 與 ref 後設定本精確分支；並提供原 team/project 的合法正常 SSO 工作階段。取得後即可承接已批准的同一次集中推送／自動建置，不需重問同一批准。若仍無合法身分或 URL 不能證明隔離，就保持受阻，不消耗唯一一次建置。

下一步：父線補齊安全連線來源與合法登入工作階段，執行者再接續已批准的受限 Preview；目前未推送或建置。

## 2026-11-02 13:36（台灣）人工預覽驗收發現的讀取阻擋

- 本人已正常登入41742dfc受保護預覽，以Staging Admin（HQ角色）切至已核對的`store-lubymusic`／「音樂教室 / 測試店」，點「替學員預約」後，`/hq/dashboard/courses?date=2026-11-02&action=booking`出現digest `2617175082`。只有入口操作證據，尚未完成一般店長角色或補課交易畫面驗收。
- 精確部署`dpl_2BQN8Uvo4gyifxgXScBTdhqoBJeS`的05:36:30Z runtime log顯示，`getCourseCards`對既有`yjy-pilot-card:`來源卡呼叫`isMusicPilotCard`，被原來源分支的精確環境限制拒絕：`Music opening build/runtime requires its exact authorized Preview branch and repository.`。相同的未隔離呼叫亦存在於名單讀取。
- 不重試被拒的來源操作、不擴分支或Importer權限、不改DB／SSO／分享。新增純讀取狀態`musicPilotReadIssue`：非原核定環境內的pilot卡顯示「此來源方案目前僅供查閱，無法預約或變更」，可用額度回0、不授予openingReservable，也不讀取核定來源憑據。普通native卡繼續正常載入；真正的來源識別與所有寫入沿用原本會拋錯的exact-environment gate。
- 先新增真實query regression：卡清單與名單各一案在修正前以相同環境錯誤失敗（2 failed / 25 passed），再做最小修正；補正反例確認原核定來源環境仍須通過receipt hash及cardId核對、非核定環境直接呼叫原驗證仍拒絕。
- 最終聚焦六檔135項通過：music-opening-read-integration、music-operational-pilot-policy、music-native-leave、course-music-term-roster、course-card-browser-read、music-opening-preview-guard。紀錄`/tmp/music-preview-read-red-20261102.log`、`music-preview-read-focused-20261102.log`。
- 變更三個TS檔的ESLint、diff check與`tsc --noEmit --incremental false`通過（exit 0）；型別紀錄`/tmp/music-preview-read-typecheck-20261102.log`。此新增修正未用舊版全量結果充當本版全量。此前最新main 9c399379與41742dfc的本機合成候選曾1595檔／15299項通過、31檔／265項略過，另12項補課PG零略過通過；該證據早於本節變更。
- 本節修正目前僅在本機；41742dfc預覽仍會遇到原錯誤。未推送、觸發新建置、合併、正式部署或建立測試帳號。既有單次建置已用完，若需更新同一PR及受限預覽，須依本人原先的次數／費用限制處理，不能自動重建。
