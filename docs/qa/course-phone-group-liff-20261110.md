# 課程 LIFF 同電話集中查看：入口核對

基準：分支 `work`，HEAD `236d637d`。承接本聊天工作區的學員共用聯絡電話候選；本文件記錄入口核對與本機候選實作，不代表部署或正式驗收。

## 最新使用者決策

採用同一家店、同一聯絡電話集中查看學員的方式。四個孩子或親戚仍各自有學員資料、方案、扣堂與點名；不新增大人的顧客資料，不新增親屬關係或家長表單欄位。大人從原 LINE LIFF 入口進入，完成首次電話綁定後查看該組名單。

此決策取代前面討論的「另建媽媽顧客再逐一綁孩子」與「每位孩子分享家庭邀請連結」方案。登入用的系統身分仍存在，但不因此增加一筆大人顧客。

## 修改前已核實的基準行為

1. `src/app/(liff)/liff/onboarding/onboarding-form.tsx` 初次登記必填姓名與手機，姓名預填 LINE 暱稱。已有有效 LINE 店家連結時會先刷新登入，成功後跳過表單。不是每次進入都必須重新填寫。
2. `src/app/(liff)/liff/onboarding/actions.ts` 的課程分支直接呼叫 `onboardCourseLineMember`，不走後面蒸足的電話確認／恢復流程。
3. `src/server/services/course-line-onboarding.ts` 遇到既有電話資料會回 `identity_review_required`；只有新電話無衝突時，才建立 User、Customer 和 LINE 店家身分連結。因此目前不能讓媽媽填本人姓名、既有共用電話，便直接登入全家資料。
4. `src/server/services/liff-login-recovery.ts` 的既有核對佇列可作設計參考，但批准入口要求蒸足店家與中央 LINE provider，不能直接接到課程當成已支援。
5. `src/server/services/central-member-resolver.ts` 刻意不使用姓名、電話、email 建立會員權限；`course-access.ts` 的 `courseAccount` 解析一個已核實的店家顧客。不能把多位孩子直接寫成同一個個人身分，或放寬全站中央會員解析器。
6. 課程 LIFF 登入後由 `liff-shell.tsx` 導向課程會員頁。`src/app/(customer)/book/course-portal.tsx` 的方案、歷史、預約等查詢均以單一 `customer.id` 為主；只改 LIFF 表單不會帶出其他孩子。
7. 工作區的共用電話候選將後續不同名學員的電話保存在 `contactPhone`，個人登入電話仍在 `phone`。家庭名單需要用統一的有效聯絡電話查詢，不能只查 `phone`，也不能只放寬唯一索引。

## 後續實作邊界

- 新增課程專用、經後端核實的「本店電話查看授權」，將已驗證的 LINE 身分與本店聯絡電話連結。既有 LINE 身分驗證只能證明該 LINE 帳號，不代表已證明輸入電話的使用權；可沿用本店已核對的證據，否則需要電話所有權驗證或店家確認。不假設已有 SMS OTP 服務。
- 已有學員的電話綁定入口不建立大人 Customer，不用姓名比對來授權，也不改孩子姓名。真正新學員的首次登記保留獨立流程，不能全站刪除姓名要求。
- 依該授權和店家範圍讀取未合併的同電話學員，方案、堂數和課程顯示姓名以避免混淆。新建孩子若加入已授權電話組，應依最新有效電話即時顯示；電話變更或授權撤銷後必須重新核對。
- 個人登入身分、其他 LINE 綁定或聯絡歸屬有衝突時不覆蓋，交由門市確認；不因電話相同重新分配個人帳號。
- 此次已確認的權限是集中查看學員課程與堂數。「可看見」不自動等於可退款、修改健康資料、轉移點數或變更身分。任何後續預約／取消等操作仍須逐項後端授權，不以客戶端傳入學員 ID 取得權限。
- 僅課程模組先調整，不把蒸足、美業或其他門市的既有顧客一併納入電話群組。

## 驗收條件

- 同店四筆學員共用電話：授權後可看四人的各自課程／堂數；不增加大人 Customer，不合併學員或帳務。
- 首次登記既有電話不再因大人姓名與孩子不同而建立重複顧客；後續有效登入不重填。
- 未核實電話、其他店家、停用 LINE 身分、已撤銷授權與改號後舊授權均不能讀取學員名單。
- 不以提交任意 phone/customerId、舊快取或切換網址繞過授權；衝突不改寫既有身分。
- 登出、重新登入、孩子新增／改號、課程與堂數獨立顯示、手機窄螢幕均須驗收。

## 後端第一批實作與驗證

第一批在工作區加入 `src/server/services/course-phone-view.ts` 與核心 migration `20261110095649_course_phone_view_grant`。migration 名稱先由本機 Supabase CLI 產生，再放入既有核心 Prisma 路徑；不重複登記 Supabase migration history。第一批僅後端基礎，後續入口串接結果見下節，不能以本機候選視為正式可用。

- `approveCoursePhoneView`：透過 `courseManager("customer.update")` 核對本店工作權限，限制店長／店主／總部，檢查管理範圍。由既有已驗證學員推導帳號、店家與電話，不接受瀏覽器指定 userId／phone；不新建 User、Customer 或修改個人身分連結。SELF_ONLY 管理者不能批准超出其管理範圍的同電話群組。
- `readCoursePhoneLearners`：只使用當前登入者與後端核實的本店學員，重新查詢有效授權；未批准只回自己的名字及 ID。批准後查本店有效的個人手機或聯絡專用電話，回各學員 ID／姓名；不回手機、內部備註、其他登入憑證、帳務或健康資料。沒有跨請求快取，也沒有接受任意 childId 的切換權限。
- `revokeCoursePhoneView`：同店與管理範圍檢查、可重送的撤銷，批准／撤銷均有後台稽核。授權與名單讀取分別在 Serializable／Repeatable Read 交易內執行。
- SQL 保留租戶複合外鍵、有效電話格式、同店同帳號同電話唯一約束。啟用 RLS，不開客戶端 policy，撤回 PUBLIC／anon／authenticated 的表格與觸發器函式操作權限。
- 錨定學員改號、改身分、合併或 LINE 身分連結異動會由資料庫觸發撤銷；電話改走又改回不會恢復舊授權。一般正名不撤銷。獨立登入身分衝突會擋住整組名單，不偷偷轉移或合併。

驗證：6 個測試檔共 88 項通過（新授權／撤銷／隔離、實際 migration 的 PGlite 約束與 RLS 權限、前批共用電話 action／migration，以及既有課程 LINE onboarding 與 LIFF action 回歸）。首次 PGlite WASM 初始化超過 5 秒，該檔測試等待上限改為 20 秒後通過，不調整正式程式逾時。完整 TypeScript 檢查、Prisma schema validate 與新增檔案 ESLint 通過。

第一批沒有 UI 變更，不能直接把名單讀取服務當作首次電話驗證。

## 第二批：LIFF、店長與前台串接

本機已接上以下流程：

1. 課程 LIFF 首次登記先顯示聯絡電話一欄。既有電話只建立 `StoreMemberConnection` 中 `course-phone:` 命名空間的待確認申請，不建大人顧客，也不回傳孩子名單。相同未過期請求重送沿用確認碼；新電話才展開學員姓名，清空 LINE 暱稱，避免把媽媽名字當成新學員。
2. `requestCoursePhoneLogin` 只由已核對 LINE ID token／本店 audience 的 onboarding action 呼叫；電話是選取待核對名單，不是授權證據。記錄既有電話群組的原始個人手機學員為錨點，沒有個人手機才選最早聯絡學員。待確認有效期 24 小時。
3. 學員詳情新增 `CoursePhoneViewPanel`，既有電話同組任一學員均可找到該電話錨點的確認申請。店長／店主／總部須具 `customer.update` 且涵蓋群組管理範圍，核對本人及手機確認碼後批准。批准在店家鎖與 Serializable 交易內建立必要登入 User／Account／本店身分連結及電話查看授權，從不增加 Customer 或修改孩子姓名。其他門市的中央帳號保留原有 legacy Customer，使用本店 scoped link，不搬移全域 User。
4. 既有本店登入已核實時，可在同一面板核對聯絡人並批准群組查看，也可停止集中查看。批准重送不重建身分、不復活已撤銷授權。一般通知確認 action 拒絕處理 `course-phone:` 請求；既有通知讀取排除它，避免誤作 LINE 通知連結。
5. 媽媽重新進入原 LIFF 後使用已核實的 LINE 店家身分登入，不重填姓名／電話。課程首頁 `CoursePhoneLearners` 顯示每位學員自己的方案餘額／可用量、接下來 20 筆及最近 20 筆課程（明示筆數）；共用方案標明共用，不合併或加總池額。查詢嚴格套用本店與學員 ID，回傳只投影名稱、日期、狀態與餘額，不回其他共卡人員、內部備註或身分憑證。
6. 核心與課程庫讀取後再核對一次群組授權與名單；讀取期間撤銷或換人，整個回應失敗，不把已收集的其他學員資料交給客戶端。前台及面板使用既有 panel reader，TTL=0；換帳號／學員時不顯示舊 scope，晚到回應丟棄。

資料庫觸發器補驗：一般登入的身分同步只更新時間／相同欄位，不撤銷電話查看授權；真正改 provider、subject、user 或 customer 才撤銷，刪除身分亦撤銷。避免媽媽每次登入被誤撤銷。既有獨立身分衝突仍顯示需核對，不提供強制覆蓋。

後台指南 C109 已更新電話共用、核對批准與停止集中查看；不新增會員前台操作指南。

## 第二批驗證與限制

- 16 個測試檔共 251 項通過，涵蓋新申請／重送／批准／撤銷、偽造或過期確認碼、provider／channel 變更、SELF_ONLY 管理範圍、中央帳號跨店保留、獨立身分衝突、讀取中撤銷、晚到 UI 回應及既有課程前台／LIFF 回歸。PGlite 執行實際 SQL，含一般登入同步不誤撤銷的案例。
- 後續狀態／樣式微調後，重跑相關 4 檔 26 項及帳號 scope 的前台測試；完整 TypeScript、新增程式 ESLint、Prisma schema validate 與 diff 空白檢查均通過。未執行專案 `build`，其腳本包含 migration；不能在未設定隔離資料庫時作為純前端驗證執行。
- 瀏覽器使用實際 React 元件、本機 Vite 與模擬 action／LINE SDK；沒有真實 LINE、正式會員或通知。覆蓋電話一欄 → 確認碼 → 店長批准 → 再進入導向會員頁 → 四位學員 → 展開課程 → 失敗重試 → 撤銷後不顯示。連點只送一次批准；新電話才詢問學員姓名，沒有帶入媽媽 LINE 暱稱。
- 本機尺寸：前台 390×844、440×900、768×1024、1366×900；店長確認 390×844、768×1024、1024×768、1366×900、1920×1080；沒有橫向溢出。預覽／截圖／結果在 `/tmp/course-phone-liff-preview`，是模擬尺寸，不是真機或正式登入驗收。首次 fixture 的 SDK mock 解析及 Vite 初次依賴重載問題已修正後重跑，不隱藏成成功。
- UI 情境選用 04（批准重送與權威確認）、05（詳情換人）、06（帳號／店家隔離與晚回應）、08（小螢幕）、10（錯誤重試），並以既有課程前台回歸涵蓋課表模式；本次沒有做付款、扣堂、通知或效能秒數承諾。

所有程式仍是本機未提交候選，未 push、建 PR、部署、執行正式 migration 或外發。正式發佈前須先在隔離環境依序套用 `20261110082629_course_family_contact`、`20261110095649_course_phone_view_grant` 並核對生成的核心 Prisma client，再以真正的本店 LINE 設定與測試帳號驗首次登入、批准、重登與改號。尚未有這一層真實身份整合證據；不可宣稱正式可用。純本機 UI 預覽未建立雲端建置或增加雲端部署費用。

環境核對只檢查檔名與設定存在與否、不輸出值：工作區只有 `.env.example`，執行環境未設定 `DATABASE_URL`、`DIRECT_URL`、店家 LINE 設定或中央 LINE 通道／Provider。已向使用者索取可用隔離測試站或測試店家，未要求在聊天貼出密碼或金鑰；在取得真實測試環境前不將模擬 SDK 成果寫成正式 LINE 驗收。

## 使用者要求自行尋找測試站後的雲端核對

前段缺少設定僅指執行工作區，不能推論使用者沒有雲端測試環境。已透過連接的 Vercel／Supabase 做唯讀盤點，不再請使用者自行尋找已有資源。

- Supabase `steamfoot-preview`（`ttworfzgwejdeolegkxl`）目前 `ACTIVE_HEALTHY`；與正式 `steamfoot` 專案為不同 project ref。僅查測試庫表結構及合成店家 metadata，未查顧客資料，未對正式庫執行 SQL。
- 最適合沿用的 LINE 候選是 `course-start-0918-a`，店名「運動教室 / 測試店」，COURSE／ACTIVE，既有公開 LIFF ID `2010761154-2BkMDceh`。`lubymusic` 也是隔離課程測試店，但其 Store.liffId 為 NULL，不優先用於首次 LINE 綁定驗收。
- A 固定測試站：`https://steamfoot-booking-git-codex-cour-21e5e0-rock7652-2111s-projects.vercel.app/s/course-start-0918-a/liff`。Vercel 對應部署 `dpl_6tgwJbk88Un7fLak5mCT9J9bE3p8`，狀態 READY／非 production，分支 `codex/course-liff-ui-20260922`，SHA `622c261b55aca162e9afffb7fb11fbc77209ac29`。讀取該頁得到 HTTP 200，HTML 的部署 ID、店名及 LIFF ID 與查核相符；公開 LIFF URL 亦 HTTP 200。這些只證明入口可讀，不是使用者的 LINE 身分登入完成。
- Vercel 該分支存在獨立 `STORE_LINE_CONFIG_JSON` 及 A 店通道機密的設定項；只取未解密 metadata，不下載金鑰或顯示值。Preview 的 DATABASE_URL／DIRECT_URL 設定項也存在。尚未以當前有效的部署前置檢查證明這個舊站的實際資料庫連線，不能僅靠變數 target 或舊報告宣稱隔離已通過。
- 測試庫目前既無 `Customer.contactPhone`，亦無 `CoursePhoneViewGrant`。既有 A 部署為舊版，不含本聊天本機修改，不能在這個舊頁上宣稱家庭流程驗收成功。

建議沿用 A 的既有 LINE 測試入口，準備對應本批修改的隔離驗收版本；發佈前先明確核對 Preview 連線與通知阻擋，再審查兩項指定 migration 對共用測試庫及舊版測試站的相容性。這次使用者要求是讀取可用測試站，因此本輪未推送分支、部署、更新 LINE Endpoint、套用 migration、新建專案或重啟通知。

## 使用者後續明確要求執行 A 測試站更新

在使用者回覆「好／請執行」後，授權範圍為既有 A 的隔離驗收更新，仍不含正式站或通知外發。候選放入 `/workspace/course-phone-a-preview` 工作樹，原工作區保留。既有遠端 A 分支 `622c261b` 是候選基準 `236d637d` 的祖先，可正常快轉，不強制推送或覆寫他人歷史。

新增 A 專用 build/runtime gate：精確檢查 Vercel Preview、A 分支與 repo provenance、兩條連線只可指向 `steamfoot-preview`、禁止其他模組資料庫／migration／外發模式，要求既有 A LIFF 設定。核心 client 與 Next config 都沿用既有 release dispatcher 驗證；A dispatcher 分支在建構 DB client／遷移前結束。build 另做 read-only schema／A 店／private grants 檢查。只關閉 A 與本機候選分支的 Git 自動部署，保留正式規則，避免 push 與手動部署重複建置。

已對 `ttworfzgwejdeolegkxl` 套用兩項指定 SQL，與原核心 migration 的 checksum 完全一致：

- `20261110082629_course_family_contact`：`2f3a69cfe658f87394c2199a2f1457f6512b258dc0035cdc2049f4ed77af8acc`
- `20261110095649_course_phone_view_grant`：`f864790a0b779597f311ca722117d0cadc01632684dbfe27f2507db4ffd84177`

本次遠端採單一原子 installation transaction，持有 advisory／Customer schema lock，先核對 A 標記、無失敗／已套用 ledger，最後比對既有顧客快照；核心 `_prisma_migrations` 各登記原始 checksum／完成一步。Supabase migration 介面另記錄此隔離 installation wrapper `course_family_phone_preview_20261110`，不再把 SQL 複製到來源 Supabase migrations 或執行第二次 DDL；此記錄是環境安裝證據，未改正式 migration runner。

更新後：既有 Customer 1349 筆，排除新 NULL 欄位後的摘要仍為 `a513a8386779fb92eb0aaa8459e297f5`；新增 contact 值與查看授權皆 0，原資料未填入、合併或更名。授權表 RLS=true，PUBLIC／anon／authenticated 表權限 0。部署前既有非空唯一索引無依賴，兩筆歷史空電話分屬不同店，符合保留的 legacy blank 唯一約束。正式專案沒有 SQL 或部署操作。

首個隔離版本 `438f85d25255c1db93a7782ef519de05435a6b54` 已正常快轉至 A 遠端分支，Vercel `dpl_91UqRCewTN15uG54xDgXZ8f2xqRY` READY／target=null，固定 A alias 已對應，沒有 production 發佈或專案級 staging alias。API 先拒絕字面值 preview；staging 因額外 alias 風險遭自動審核拒絕，查官方文件後改用「省略 target 即 Preview」的較小範圍方案成功，不使用被拒絕的 staging 途徑。

瀏覽器先被 Vercel 保護頁擋住，預設分享連結也遭自動審核拒絕。使用者之後明確核准「1 小時驗收連結」，才為 A alias 建立 ttl=3600 的短效存取，並撤銷前次唯讀 web_fetch 產生的較長效自有連結；沒有關閉專案 Deployment Protection。權限驗收仍必須系統登入，不把 Vercel 可讀視為會員授權。

真實 hosted app＋隔離 DB 的 7 項檢查已通過：合成 A 店長登入、實際後台批准 action、合成會員手機密碼登入、四個獨立方案餘額 8／5／3／10、390／440／768 寬度無溢出，以及實際撤銷後前台不顯示其他學員。使用本次新建的兩筆暫時 User／一筆 Staff、四位 Customer／四張方案卡與一堂合成課次；不新增大人 Customer、不收款、不發送通知。這是真實身份／action／DB／頁面回應，但不是持有者真實 LINE ID token 的驗收，該步仍由使用者手機完成。

自動瀏覽器的初始失敗來自執行環境 Chromium 未信任代理 CA，以及測試腳本在 loading 狀態過早判斷按鈕；修正測試設定與等待條件後才記通過，不算產品成功證據。HTTPS 忽略僅在已核對的隔離 host 與合成帳號測試 context，沒有變更站台 TLS 或使用者瀏覽器。

另修正明確的 `memberEntry=liff` 課程 onboarding 返回路徑，讓短效驗收入口使用 LINE 登入後回會員首頁；一般 booking=1 體驗入口維持原路徑，非課程不接受此返回例外。相關 3 檔 65 項與完整型別檢查通過。

補驗兼具員工與會員身分的既有中央帳號：與現行 `verified-line-customer` 相同，群組查看依已核實的本店會員及 active 狀態授權，不用持久化的 OWNER／PARTNER 角色排除合法的 CUSTOMER-context session；不修改帳號原有角色，也不減少中央會員、其他學員身分衝突或店長操作權限檢查。相關 4 檔 92 項通過。

## 最終隔離交付狀態

最終程式 SHA：`709a7e71712982b3969ac736c34221872dda1dba`，A 分支正常快轉；Vercel Preview `dpl_GLhwXpgSipJkYNDxd2Yf3tjasFQh` 已 READY／target=null，固定 A alias 精確對應此部署。版本證據使用平台 alias／commit metadata，動態 HQ HTML 不保證保留 data-dpl-id，不能以該 attribute 缺少判定部署錯誤。

最終 hosted 複驗 8 項通過：Owner 登入、後台實際批准、會員登入／4 個獨立餘額、390／440／768 RWD、實際撤銷，以及已有會員 cookie 時無效 LINE token 仍回 401。結果與截圖在 `/tmp/course-phone-a-hosted-qa`，不含可用的帳號憑證或分享 token。某次密碼欄等待逾時未能重現；同一版本重跑觀察到實際 phone check 200、登入 303，最後全項通過。此記錄不把單次通過擴張為所有冷啟動穩定性保證，也不把手機密碼驗收稱作真人 LINE token 驗收。

驗收後已移除合成測試 phone identity link，取消合成錨點的暫時 User 關聯，兩個合成 User 均 SUSPENDED、清除 passwordHash／phone，合成 Staff 停用；沒有刪除四位學員、方案、課程、稽核或其他店資料。清理首次確認逾期，原查核顯示未執行；照工具指示以同一組精確 SQL 重新確認成功後才記完成，未換路繞過確認。原 1349 筆顧客摘要仍為 `a513a8386779fb92eb0aaa8459e297f5`，合成學員 4、啟用中合成授權 0、錨點未綁 LINE，供使用者下一步以真正 LINE 身分送出首次申請。

使用者核准的 A 短效存取至台灣時間 2026-11-10 19:58:41，token 僅放私人驗收設定與交付給使用者的 URL，不提交來源、報告或截圖。給使用者的入口採 `/s/course-start-0918-a/liff/onboarding?booking=1&memberEntry=liff` 加短效參數，可在受保護 Preview 中完成正常 LINE OAuth，再返回會員首頁。測試聯絡電話 `0900000110`，申請仍須店家核對確認碼；既有已連結 A 會員直接沿用原身分，不靠輸入測試電話強制改綁。

正式站未合併或部署、正式庫未執行 SQL、通知外發維持封鎖。Cloudflare 不是本次 A Vercel 部署依賴，沒有更動其設定。下一步由使用者手機開啟短效 LINE 入口並回覆確認碼；真人 LINE 認證與首綁流程在取得此操作證據前仍屬未驗。

## 使用者單一 LINE 的後續驗收

使用者已經由真正 LINE 登入 A 店既有會員；為避免要求第二個 LINE 或解除原綁定，使用者同意沿用既有 A 會員做群組查看。只變更四位 `qa-family-phone-a-20261110-child-*` 合成學員的聯絡電話，使其與既有 A 會員相同；不更改該會員的電話、身分、方案及課程。四位保留獨立 ID／卡片／堂數。此次是既有會員加四位合成學員，共五筆；不是首次 LINE 綁定驗收。

暫時重新啟用自建的合成 Owner／Staff，使用既有短效入口與實際後台 UI 對該會員執行集中查看確認。結果 `approved:true,learnerCount:5,errors:[]`，資料庫確認啟用授權與 APPROVE_COURSE_PHONE_VIEW 稽核存在。完成操作後立即再次停用合成 Owner／Staff 並清除其密碼，不讓可登入的臨時帳號留存。群組保留供使用者現有 LINE 重新整理會員首頁查看；尚待本人畫面確認，完成後由助理撤銷這次授權並將四位合成聯絡電話還原為原驗收電話。未碰正式環境，未使用他人 LINE 登入資料。

## 使用者確認的日期格子版

使用者回報首頁攤開太長，並提供另一項後台工作中的格子示意，要求前台同樣依方案堂數顯示：8 堂固定四欄兩行，10 堂五欄兩行，僅已出席或有效補登的實際日期填格，預約／請假不填成已上課。此處沒有修改另一工作中的後台格子程式。

A 候選 `a877cbeabaa2312c24b04dbbaebc7dc6ff213522`：學員預設收合，同一時間展開一位；有效方案展開後可見日期格，歷史方案及課程記錄收合；群組有效時不再重複原會員摘要，撤銷後恢復個人摘要。只改顯示和受授權學員的唯讀資料投影，不新增家屬預約／扣堂權限。

格數取自不可變 GRANT 紀錄，不以可變方案設定、名稱數字或剩餘量猜購買數；日期查詢限定同店／該學員／已出席及未停課，不洩露其他共卡人的日期。有效補登依既有異動來源讀取，排除撤銷及其他人的異動。來源匯入未可證的數量、超過 500 或互相矛盾的紀錄不畫假格，仍保留權威餘額及課程記錄。點數方案保留點數顯示。

4 檔 25 項測試、完整 tsc 與修改來源 ESLint 通過；另外方案相容規則 2 檔 18 項通過。合成 browser fixture 在 390／440／768／1366 寬度確認 8 格4欄、10格5欄、互斥收合、無橫向溢出及摘要不重複；結果 `/tmp/course-phone-grid-preview/results.json` 與截圖。這些截圖是合成呈現驗收，不代表真正 LINE 會員在新版的 hosted 驗收已完成。

同時收到正式銀百合「已購買卻顯示無適用方案」截圖，已僅唯讀查核該店該時段四筆，不寫正式資料。舊指定學員課程於台灣 18:04 已取消，其指定權益與學生現有開放選課卡不同；18:06 已另建同時段開放選課，四位均 RESERVED，各有 1 張符合開放選課、期限及本店成員條件的有效卡。最新實際畫面尚未查驗，不能將舊截圖直接當成當前程式缺陷，也不把改開放選課造成的資料變更記為本次修復。沒有替使用者點名、扣堂或補購方案。

格子版 Preview `dpl_KRTnGUPSczQVK9UBN7mDBELKzycv` 建置完成並 READY；來源 A 分支 `a877cbeabaa2312c24b04dbbaebc7dc6ff213522`。原 1 小時分享入口在本次等待期間已過期，沒有默默延長或建立額外分享連結；合成版面截圖可供使用者先核對，真正現有 LINE 群組新版畫面仍待本人確認。

## A 店格子與實際紀錄對帳

使用者確認格子版後要求下一步，已再次唯讀核對 A 店實際資料及已部署來源；不為了填滿示意格而製造出席或扣堂。四位合成學員原有總格數／剩餘／預約占用／可再約分別為 A 8/8/1/7、B 5/5/1/4、C 3/3/1/2、D 10/10/1/9。四筆均只有 2026-11-11 13:00 的 RESERVED，沒有 ATTENDED 或有效補登紀錄，故真實畫面的日期格應全空白。先前圖片中的 11/03、11/10 是明示的合成 UI 示意，不能當成這四位的實際上課日期。原會員既有 8 堂卡也無出席紀錄。電話群組授權仍 1 筆有效，兩個合成驗收帳號維持停用及無密碼。

4 檔 25 項格子／摘要／群組／撤銷／跨帳號晚回應測試複核通過。未再部署或寫資料。最新 A Preview 已於前一階段 READY 並對應來源 a877cbeabaa2312c24b04dbbaebc7dc6ff213522；真人 LINE 在新版展開學員畫面仍未驗，先前一小時入口已到期，若要新的一小時分享需使用者確認，不能當成已驗或默默延長。


## 本人新版截圖驗收

使用者提供台灣時間 20:18–20:19 的 A 店本人登入截圖：原會員與四位合成學員均可見；A 8 格四欄兩行／剩餘8預約1可再約7，C 3格／剩餘3預約1可再約2，D10格五欄兩行／剩餘10預約1可再約9，原會員8堂格與10點純數字分開，各學員可獨立展開。尚無出席，空白日期正確；未把這些空白截圖當成實際點名日期或首次 LINE 綁定的驗收。授權仍保留本輪檢視用途，正式站未部署。

截圖發現 3 堂方案沿用四欄容器，末側留下多餘上框線。僅調整1–3堂以實際總數作欄數；8堂四欄與10堂五欄保持使用者確認的版面。沒有增加格數或修改任何堂數資料。
