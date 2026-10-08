# 課程門市：學員自行預約開關

## 範圍與操作

運動、音樂共用 COURSE 模組，設定 → 營業與預約 →「允許學員自行預約」。預設開啟；缺少舊店規則列時沿用開啟。只修改目前有寫入權限的門市。

關閉後：
- 學員仍可看公開課表、自己的預約、方案及原有候補順位。
- 停止學員新增預約、改時段及加入候補，包含共卡／同行與體驗課改期。提示「如需預約或調整時間，請聯繫店家」。
- 原有取消截止、候補退出、購買／核帳申請與體驗到場確認保持既有規則。未新增學員自行請假的權限。
- 店家代約、排課、教師工作及人工候補遞補維持原有權限與其餘業務條件。
- 自動候補遞補在處理任何候補列前暫停；不刪除、不改順位、不標記 SKIPPED，也不產生遞補通知。
- 重新開啟後，後續既有取消／容量調整等事件恢復觸發遞補。切換本身不執行整店補跑或發送通知；店家仍可人工遞補。

本開關不修改課程「上架／隱藏／下架」、既有預約、金流、剩餘堂數、候補功能授權或其他模組設定。不適用蒸足及 SPA。

## 權威檢查與併發

- `CourseBookingRule.selfBookingEnabled` 為店家級 boolean，DB default true、NOT NULL；selfBookingRevision 預設 0，每次有效切換在同一鎖內遞增。
- 設定 action 使用既有 `courseManager("business_hours.manage")`、訂閱可寫檢查及課程門市交易鎖。輸入只能包含 enabled，不能傳店家或其他設定欄位。
- 一般新增／新候補／改期在同一門市鎖內重新讀規則。改期在取消原預約之前檢查，避免體驗改期轉成非會員 actor 後漏擋。
- 已提交的冪等請求可以回傳原有結果；不因此新增預約。
- 人工遞補只有既有 `booking.update`／候補功能授權 action 會傳入 server-side manual option；底層仍驗證完全對應的持久 WAITING 紀錄，保留原 actor、會員、課程、時段、額度及共卡守門。
- 未在通用會員登入／write 守門放開關，因此取消、購買、教師與唯讀操作不受誤擋。
- UI 已開啟的新增／改期視窗會隨新 props 停止提交，深連結另取權威資料；即使舊頁未重新整理，後端仍拒絕。
- 設定表單以已確認儲存值保存本地狀態，防止舊頁刷新覆蓋草稿或已成功切換。專屬遞增 selfBookingRevision 讓新伺服器值可更新未編輯狀態，舊 revision 無法覆蓋已確認值，編輯中的草稿保留。

## 發布及回復

初版僅完成本機程式／migration source；後續經核准進入隔離發布階段，最新進度見下節。正式店家尚未切換或部署。

正式發布前須另行完成：
1. 依既有核准流程套 additive migration `20261008054000_course_student_self_booking`，再生成 course Prisma client 及發布依賴新欄位的程式。
2. 真實隔離 PostgreSQL 的 action／併發驗證，以及已登入 Preview 的設定、學員、教師完整操作矩陣。
3. 桌機 1366／寬版、iPad 1024×768／768×1024、前台 360／390、LINE LIFF／Safari／Chrome 實際 RWD 驗收。

回復舊程式可保留新增欄位，不 DROP、重設或刪除任何預約／候補。既有正式測試及發布流程仍需重新確認目標和備份。

## 驗證界線

- 單元／JS DOM 覆蓋：權限、店家 scope、預設值、只改自己的設定欄、取消截止、共享／同行、試約改期、人工遞補、候補暫停／重啟、深連結及已開啟視窗、購買與教師操作、草稿／重複提交等。
- 本機 PGlite 驗證 migration 預設值、既有欄位不變、門市獨立及 NOT NULL；不等同真 PostgreSQL 併發或完整業務驗收。
- 獨立 DB-free UI fixture 已備妥；本機 Chromium 因環境 socket／Crash Reports 權限未能啟動，未宣稱已完成視覺或真機驗收。
- 首輪完整非增量 TypeScript 以 4GB heap 執行被系統終止（exit 137）；最終以 2.8GB heap 在 main `866f332908fd06fbea694a5e828519ffa79570ea` 加本功能的完整候選上重跑，已通過。
- 變更 TS／TSX 的 ESLint、Prisma schema validate/generate 與 diff check 通過。獨立靜態審閱發現的同店刷新舊狀態問題已以 revision 修正，複審未見剩餘具體阻擋。

## 最終本機結果（2026-10-08）

以 main `866f332908fd06fbea694a5e828519ffa79570ea` 為基底：非增量 TypeScript 通過；完整 Vitest 876 檔通過、16 檔略過，7,693 項通過、120 項略過、0 失敗。真 PostgreSQL 整合 opt-in 關閉，使用 dummy localhost 連線設定；略過項目不算完成。


## 已批准的發布階段（2026-10-08）

使用者已批准原倉庫 Draft PR、運動測試站隔離驗收，全部通過後正式發布；各真實店預設保持開啟，禁止為驗收切換真實店。

- 本候選已移植 main `35135676789dace171b84394da4c44c566a32259`。新增獨立 `course-self-booking-preview` release mode，精確分支 `codex/course-student-self-booking-switch`；不借用其他功能的分支或旗標，保留原 consultation/shared-card/production 與無 DB guide 模式。
- 首次公開前即停用本分支自動部署。Preview 的 DATABASE_URL/DIRECT_URL 只能沿用既有隔離專案 `ttworfzgwejdeolegkxl`；強制 exact repo/provider、strict URL/options、無外發。三個 DB client 在讀取任何 cache 前檢查環境；build 的唯讀 schema/test-store preflight 通過後退出，不跑其他 migration。
- 隔離 DDL 已完成：Supabase migration `20261008062907` / `course_student_self_booking_20261008`。實際只新增已核准兩欄，原 3 筆規則全為 enabled=true/revision=0；RLS 仍啟用、無 client grants/policies；沒有套用其他 pending migrations。
- 運動測試店固定 `store-course-start-0918-a` / `course-start-0918-a`。只使用已證明虛構的 fixture／既有測試身份，不廣列顧客身份、不建立登入憑證、不用真實學員。
- 正式 DDL、merge/deploy 尚未執行；需 exact-head CI、真 DB／併發與授權的 UI 驗收通過，且與其他發布協調完畢。

## 隔離發布與實際 PostgreSQL 驗證

- Draft PR #1257：https://github.com/rock7652-beep/steamfoot-booking/pull/1257 。已整合 main `3458324057bf79a3eb91ce61271f72bd9f0d13d2` 的五個發布檔案，保留原有無 DB 指南預覽模式。
- `8240e4cc8b21f0643977216614a06ce3c3f42102` Preview 已 READY；build 確認 isolated_database、schema_ready、test_store_ready、notifications_blocked、migrations_skipped 全為 true。該版完整 Vitest、targeted tests、ESLint、既有 sports/music PG audits 通過；Typecheck 發現新 Preview 測試 env 型別過寬，已明確標註 NodeJS.ProcessEnv，仍須在更新版本重跑。
- 新增 disposable loopback PostgreSQL 驗證：預約／候補 14 案、通知改期 6 案，Sports CI 強制全部通過且零 skip。包含真實兩個獨立 backend PID 的 Store 鎖阻塞觀察，切換提交後新增預約拒絕、自動候補原列與順位完整保留；人工遞補精確紀錄驗證、重新開啟、取消及 card/trial 原預約與付款保留。這些案例不使用 Supabase 或真實客戶資料。
- 已登入的合成學員 UI 尚未驗證：未找到經確認的測試學員登入身份，禁止改用真實學員或新增持久憑證。瀏覽器驗收與正式發布仍為未完成項目。
