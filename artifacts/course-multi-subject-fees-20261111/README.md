# 多科目通用收費與緊湊標頭預覽

目前狀態：本機開發／隔離驗證，尚未 push、建立新 PR、套用正式遷移或發布。作者：本對話 Codex；分支 feat/course-multi-subject-fees-20261111，基底為已發布 PR1542 main 8488c00a，含標頭修正 cd36fb7f。

## 已完成範圍

- 原生課程收費的適用項目可多選，提供全選、清除、搜尋及選取數。所有勾選科目共用單一餘額；全選明確記錄當下清單，不擴及未來新增科目。
- 選一項保留 ASSIGNED，選多項保存 SUBJECTS 與 sportsSubjectIds。商品、訂單與課卡分別保留範圍；商品改範圍不回寫已購卡。單次／多次收費共用控制；堂數卡每堂 1，點數卡依已購扣抵快照。
- 開放選課、指定學員、名單／前台資格與續購查詢均支援多科目；批次預約逐堂核對實際科目。維持門市、持有人、老師資格、容量、FIFO、鎖定、防重與共卡規則。
- 舊 OPEN 卡仍須明確核對，可選多科目；不自動推測或修改林仲萱等既有正式課卡，保留餘額、效期與歷史。
- 獨立 MUSIC 期數報價與美業業務規則不變；本次原生運動入口的教學項目本來可包含舞蹈與音樂，不能將它與獨立 MUSIC 模組混為同一規則。
- 標題僅保留「收費方式」，返回教學項目與標題同列靠右，沒有新增範圍標題列。

## 隔離驗證

- 真實 PostgreSQL：course-mixed-enrollment、sports-card-modes、course-plan-save 共 61 案例全數通過，無 skip；另以最終遷移／RLS 元資料版重跑 sports-card-modes 的 23 案例通過。資料庫只位於 loopback、名稱以 _test 結尾，獨立非 superuser owner；沒有使用正式 DB 或啟動通知 worker。
- 精確遷移已在填入舊 LEGACY／ASSIGNED／OPEN 資料後演練；三張表預設空範圍、舊額度／售價／效期保留，原 RLS／ACL 不變，空的新多科目或混合權益被 CHECK 阻擋。後端另驗科目唯一、本店與啟用，不靠 CHECK 猜業務資格。
- A+B 可在兩種排課方式扣抵，C／外店／非持有人被拒；共用最後餘額併發、取消／更正、購買後商品改範圍、舊卡明確核對、合格老師聯集與實際科目資格均已驗證。
- UI 為實際 React 元件的合成 fixture，禁止網路與資料庫。列表驗 1366×900、1920×1080、1024×768、768×1024、600×800；編輯驗 1366、1024、768、600；卡片核對驗 1440、1024、768、600。選取／全選／清除／搜尋、縮放保留、儲存意圖、錯誤保留與未知回覆原請求重試均通過，無整頁橫向溢出。
- 瀏覽器模擬視窗，不是真機，也不代表正式登入或正式收款驗收。整體回歸 1759 檔／16,570 測試通過，34 檔／318 測試依外部環境條件略過；另4檔／48測試補驗通過（含全選大量項目快照上限）。TypeScript（8GB heap）與所有修改來源 ESLint 通過。詳細命令與初次失敗後的修正見 verification.json。

## 本機預覽

執行 `node artifacts/course-multi-subject-fees-20261111/preview-server.mjs`，開啟 http://localhost:5207/dashboard/courses 。僅允許本資料夾明確檔案，不含後端；頁面上的儲存為合成回應。重新產生 bundle：`QA_OUTPUT_DIR=artifacts/course-multi-subject-fees-20261111/preview node scripts/qa/course-fee-groups-browser.mjs`。bundle 不納入 git。

截圖：multi-subject-1366.png 為桌機編輯、multi-subject-768.png 為 iPad 直向模擬；sports-1366.png 為緊湊清單標頭。

## 發布條件與回復界線

- 正式資料庫遷移與合併／發布仍待明確授權；本次未執行。尚無新 PR、正式 Vercel build 或遠端 CI 證據，不得把本機驗證寫成已上線。
- 遷移檔：supabase/migrations/20261111050549_course_multi_subject_entitlements.sql
- SHA256：8e6a4871b02290aa17cefa1e3da6ed2de244e07510b3fc47f74f3d4bdc7f709b
- 只加三個陣列欄位與替換三個 CHECK，不轉舊卡、不改帳、不加角色／Data API 權限。維持 transaction、5 秒鎖逾時及30秒 statement timeout。正式執行前另確認精確目標、備份、表筆數／餘額彙總及原 RLS／ACL；執行後對照驗證，再發布程式。
- build 的既有唯讀 preflight 要求三欄位及已驗證的新 CHECK 已安裝，否則阻擋程式發布；不會替使用者執行遷移。
- 即使回復舊程式，也不能自動刪掉多科目欄位或把新卡降為單科目；保留範圍與帳務資料，舊版會拒絕不認識的模式，後續需依實際卡片使用另行處理。

下一步負責者：本對話 Codex。完成最終檢查紀錄後，交付此可檢視版本；正式變更依使用者明確授權執行。
