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
- 新 PostgreSQL 套件加入既有 `music-makeup-audit` 的同一工作步驟，與原四案串行執行，總計八案且 gate 要求無略過；沒有新 job、服務或部署。

## 費用與下一步界線

目前只使用既有本機依賴與 PostgreSQL，沒有新付費工具、映像下載或雲端建置。

已唯讀檢查 GitHub CI、makeup audit workflow 與 vercel.json。本修復分支不在 Vercel 的逐支停建名單；push／開 PR 可能觸發 Preview／GitHub checks，不能視為零費用，沒有平台用量／費率可估算金額。本次不 push，也未為放行改部署或預算設定。

其他 PR 的 Preview 對應不同應用 SHA，無法驗證本次未推送修復；可重用其已核實的隔離基礎設施，不可把舊 Preview 通過當成本版驗收。必要的後續最小步驟是先確認單一分支自動建置成本與隔離雙連線／通知封鎖，再集中一次 push／Draft PR，由現有自動流程產生精確版本 Preview，不另手動重建。上述建置／推送尚待父線決策與需要的補授權，沒有執行，也不是工具拒絕。

下一步：由父線審查本機 diff、測試與成本界線，再承接必要的推送／隔離登入驗收授權；不自行合併或正式上線。
