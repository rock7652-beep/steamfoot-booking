# 本店會員連結統一與工單完成 LINE 通知：盤點與審查版實作紀錄

盤點日：2026-10-12（Asia/Taipei）。本文件記錄設計、已實作的審查版及驗收限制；尚未發布。

## 基線與協作

- GitHub main 與本機支線基線：`695df9e22c2e5cba66f061b78a55df37e884b89d`，包含 #1308、#1312、#1309。
- 乾淨起始支線：`feat/store-member-link-workorder-line-20261012`。稍後建立唯一草稿 PR；自動部署被 review guard 禁止。
- 已讀 AGENTS.md、UI / Settings Framework、中央身分入口政策、PR-2 接線文件、工單驗收紀錄。
- 開啟中的 #1310、#1307、#1245：已核對描述及完整變更檔名，未見本需求的重複實作。此為入口與檔案層級盤點，不代表已逐行審查所有 PR。
- #1310 修改顧客詳細面板與 LINE 管理區，是接線重疊位置；本任務先建立共用服務／狀態元件，避免另做完整顧客面板。合併前重查 main 與 PR。
- #1245 的課程通知與 Preview 隔離有交集；不得覆蓋既有通知防線或搬入音樂期初业务規則。

## 可以沿用

| 基礎 | 用途與邊界 |
| --- | --- |
| User、Account、CustomerIdentityLink | 中央帳號、已驗證登入來源、本店 Customer 關係；不另建工單會員 |
| central-identity-entry-policy、namespaced-customer-identity-link | 衝突拒絕與 Provider 命名空間；新寫入不用已棄用的 legacy upsert |
| member-link、account-link handshake | 共用會員入口及已登入帳號安全補綁；OAuth 本身可能離開頁面，完成回同一門市／流程 |
| store-line-config、verified-reminder-line-route | 明確店別、同 Provider 可重用、通道可達性；不可把中央 Account 存在當成通知可用 |
| InventoryOrder、inventoryTransaction、InventoryCommand | 工單唯一來源、店鎖、revision、防重送、收款與取消／取件規則 |
| session-balance-notifications | 參考持久租約、重試截止、固定收件路徑／內容及 LINE retry key；不把工單事件塞入堂數通知表 |
| 共用 Settings、Reminder、ModalPanel | 開關、結果與就地錯誤；不另造模組骨架 |

## 已確認缺口

1. `central-member-claim.ts` 依 phone 查所有店，再批次建 link；member-link 要求重填手機並宣稱自動連多店。即使有既有會員檢查，仍不符合本次只處理本店與不得憑相同電話認領要求。需改成明確 store/customer + 驗證證據，並檢查 profile 等其他呼叫入口。
2. member-link 沒有獨立的本店通知確認步驟；`hasLineAccount` 也未充分表達本店 Provider 與通道。
3. 舊顧客有中央帳號、顧客連結、本店通知三種不同狀態；後台需分別呈現，資料冲突不能只顯示未綁定。
4. 工單 READY 在現有交易內寫狀態，未建立通知事件；现有 MessageLog 沒有工單事件鍵及這個事件的租約／重試資料。
5. 列印 QR 目前指官方帳號 URL，不是會員連結入口，不能據此宣稱顧客已完成綁定。
6. 既有工單 QA 文件含歷史 PR 狀態，須以目前程式與 GitHub 為準。

## 最少步驟首次連結方案（已確認）

推薦第一版不新增 SMS 或新的憑姓名／電話的自助認領。

- 已有本店已驗證連結：直接沿用，不填姓名電話；只補本店 LINE 通知確認。
- 有本店既有手機密碼：沿用實際密碼驗證與既有安全帳號補綁；不同 Provider 需各自驗證。若兩個中央 User 已衝突，維持人工確認，不轉移 Account 或合併會員。
- 工單已建顧客、尚無登入證據：通用本店 QR → 本人 LINE 驗證 → 顯示待門市確認。門市使用既有審核機制能否表達首次連結需接線驗證；若不能，增加獨立的本店連結申請／核准事件。店員核對本人後只批准這位顧客／本店，不覆蓋他人身份。
- 紙本共用 QR 只提供 store 上下文，不包含可認領顧客的秘密；工單號／電話不能作為認領證據。
- 若要免店員確認，另設有效期限、單次使用、可撤銷的指定顧客邀請，且透過已核實持有人交付；不可把可轉傳紙本 QR 本身視為所有權證明。這會增加持久驗證資料與交付流程，非推薦最小版。

使用者已確認：沒有既有驗證證據者，本店首次由門市核對本人一次；之後同店各模組與工單沿用。此確認不包含發布、資料庫套用或會員合併授權。

## 最小實作範圍

1. 共用本店解析／連結服務：狀態為已連結、尚未連結、需確認，通知另列可用／不可用與原因；全部以 server 的 store 上下文授權，四模組只注入業務入口。
2. member-link 与 profile 收斂至本店流程；蒸足、SPA、運動、音樂、顧客頁、工單導向同一入口。已完成步驟略過；不查全店相同電話作認領。
3. 店家通知設定新增工單取件通知，缺值等同關閉，開啟時不掃描或補排舊工單。
4. READY 首次符合開關與本店已確認顧客条件時，在工單交易內建立唯一取件事件；以 store + order + event 保證反覆切換不再新建。事件帶可追溯來源，通知結果不改收款或取件狀態。
5. Dispatcher 領租約，發送前重讀身分、通道設定、開關、額度及 READY／未取消／未取件，固定收件路徑、內容與 retry key。停止重試超過供應商去重保證的事件；不切通道補送。取消與取件需與派送決策協調鎖定；外部 API 開始前的競態須以實際並行測試驗證，不能宣稱可以撤回已開始的外部請求。
6. 顯示排隊／API 已接受／失敗／略過、時間與具體原因；API 接受不標已讀或保證送達。訊息只放店名、工單號、取件提醒、聯絡資訊。
7. 流程及開關可用後才更換 QR 與指定列印引導文案；關閉或未完成通道設定不印接收通知的承諾。

持久事件建議使用小型工單通知表，沿用共用 LINE transport／隔離守門，避免濫用 bookingId 或堂數表。Schema/SQL 可以先完成草案與本機隔離測試；任何資料庫套用另按精確目標與 SQL 取得授權。

## 驗收計畫與外部操作界線

- 四模組、同店多模組不重建 Customer；A/B 各店明確連結且通知路由獨立；不同 Provider 不推定相同身份。
- 新顧客、舊顧客、已完成連結、省略重填、同電話／多筆候選／不同 User／merged Customer／錯店／撤權全部 fail closed。
- 封鎖、通道不相容、設定關閉、額度不足、API 拒絕／逾時、租約搶占、重送、併發 READY、來回切換、排隊後取消／取件、路由更改及重試截止。
- DB 層验证唯一性／交易回滾與 worker 併發，不以單純 mock 取代全部證據；外部 LINE 用 stub，測試不得真實外發。
- UI：手機 360/390、後台桌機 1366、iPad 1024×768／768×1024、窄面板；草稿保留、控制可達、就地錯誤、無整頁溢出。靜態 fixture 不宣稱完整業務或真實裝置驗收。
- 本輪未碰資料庫、真實顧客、LINE API、通道／權限、部署；沒有會員合併或發布授權。推送前核對會否觸發 Preview，隔離與禁止外發须先落實。

## 本輪結果

已完成唯讀盤點與乾淨支線建立；本輪未修改功能程式，未執行功能測試，不宣稱功能完成。最初 sandbox 的 git fetch 因 proxy 無法連接失敗，後以核准的 git fetch 成功取得最新 main。


## 2026-10-12 審查版實作

- 通用 `/member-connect?store=<slug>` 與已登入的本店 member-link，使用同一個 LINE + 電話入口。官方帳號訊息帶明確店別；對共用 OA 的裸電話不猜店。
- Own-channel HMAC 驗證後只建立本店待確認；回傳確認碼，門市可在顧客詳情／工單核對顧客手機上同一個碼後確認，無需新增輸入欄位。此碼不是登入或認領能力。
- 首次批准在店鎖與交易內重查權限、Account、Customer、identity links 與通道；只對同店單筆顧客新增關係，不重建 Customer、不覆蓋另一個中央 User。不同 Provider、已有帳號衝突仍走既有安全驗證，店員不能藉此強制合併。
- 已有同 Provider 已驗證 membership 可以直接沿用；LINE 通知與會員狀態分開。本店中央 User 存在不代表有可用通知通道。
- 已移除既有 claim 的跨店同電話寫入；既有 LIFF onboarding 也不能僅憑電話啟用既有 Customer。新顧客原生建檔、登入密碼與安全帳號補綁仍沿用。
- 四模組共用狀態元件，接入蒸足抽屜／完整頁、SPA 詳情、運動／音樂會員詳情及工單。共用 panel reader、前後端權限、舊回應與連點守門。
- 工單首個 READY 交易建立唯一事件；關閉／尚未確認時留下不補發紀錄，反覆 READY、同指令重送與再開關不產生第二事件。發送結果與工單、收款、取件分開。
- 內容與通道在獨立交易先持久凍結；worker 再拿店鎖、顧客鎖，核對 READY、取消／取件、設定、功能授權、quota、會員及 Provider。固定 UUID retry key、最多五次與 23 小時期限。LINE push 有八秒 timeout。
- 取消／取件若先提交，派送不會開始；若 API 已開始，不能撤回外部請求。工單／派送共同店鎖決定先後，並非宣稱可撤回已接受通知。
- 首次 dispatch 用 Next `after()`，補查沿用既有每日 cron，沒有增加平台 cron 或供應商費用。每日補查不保證五分鐘即重試；超出安全期限停止，結果如實顯示。
- 列印 QR 改為本店連結入口；只有開關及官方帳號入口可用且有本環境 HTTPS origin 時才印指定引導。沒有把加好友視為綁定完成。
- Schema 草案僅在 `docs/sql/store-member-workorder-line-draft-20261012.sql`，不加入自動 migrations。兩張空表＋通知預設 false 欄位＋唯一／跨店 FK／CHECK／RLS／browser roles revoke；不回填顧客或通知。
- 精確 review branch 在 ci-migrate 與三個 DB client constructor 前禁止部署／DB 建立。PR 推送不授權 Preview 執行、套 migration 或真實外發。尚未修改 LINE／Supabase／Vercel 權限或遠端設定。

## 本機驗證

- 完整 Vitest：1,051 檔成功、16 檔依原條件略過；9,972 項成功、129 項略過。這輪在整合 #1313 前完成。
- 初次 sandbox 完整套件有子程序 `EPERM` 及新元件测试邊界问题。已修正新面板的測試隔離，並在核准權限下重跑完整套件，未忽略失敗或改跳過條件。
- 實際服務測試：電話只產生待確認、只查本店、查無／多筆、不覆蓋 owner、撤權、同店 LINE 衝突、首次確認及已確認重送；通知守門、固定內容／retry key、API 失敗、取消／取件、反覆 READY、Preview 零 probe／push。
- Local PGlite PostgreSQL 執行精確 SQL：跨店 FK、同 Provider A/B、唯一約束、批准 evidence、20 次排隊仅一筆、交易 rollback、預設關閉／零歷史隊列、browser roles 無讀寫權限。
- 合成 Chromium 使用真正新增 UI 元件及 stub actions，測試 1366×900、1024×768、768×1024、560×768、390×844、360×800：無整頁水平溢出、電話草稿跨尺寸保留、三次同 tick 確認只一個 action、開關失敗保持權威值。輸出在 `/tmp/store-member-workorder-ui`，fixture／runner 在 scripts/qa。
- 上述不是已登入的隔離 Preview 業務驗收，也不是實體 iPad／Safari、真實 LINE 加好友／OAuth／掃 QR 或實體列印。尚未驗 live PostgreSQL 多連線競態；現有工單金流及新 SQL／worker 測試不替代該證據。

## 下一個具體授權點

已透過 Supabase connected get_project 唯讀核實 `steamfoot-preview`，project ref `ttworfzgwejdeolegkxl`，ACTIVE_HEALTHY。未執行遠端 SQL。

需另授權：僅對此既有隔離 project 套精確增量 SQL，維持 browser roles revoke、不執行其他 pending migrations；接著使用既有隔離測試店與合成資料、禁止 LINE/SMS 外發，驗收 UI → action → PostgreSQL，以及同店多模組／跨店／Provider／封鎖／取消取件矩陣。Preview 放行必須先完成目標與 schema fail-closed preflight，不使用正式 DB fallback。正式合併與真實通知另外決定。


## main 整合

整合 main `9216901e`（#1313）；唯一衝突是 member-workspace 頂部新增 import，保留本次本店連結元件及 main 的 courseTemplateLabel。未覆蓋 #1313 的課程名稱／教師資格呈現、vercel.json 或 Preview 白名單。另查開啟中的 #1314 是課程設定 HQ 三態，沒有本次首次會員確認／工單通知實作；後續如合併需保留兩邊設定接線。

SQL 草案 SHA-256：`c96f4266f82eeb2a0e9f09a0f0baf5a0d05f7531d6ac8b61fe6842c1b4bafbfe`。只對此草案與既有隔離 project 提出下一階段授權，不包含其他 pending migrations、正式合併或外發。


## 最終可靠性補驗

- 已整合 #1313 後的九組回歸 81 項成功，TypeScript 通過。
- quota reservation 與固定內容／路徑先一起提交；API 逾時或結果未知時 MessageLog 不標已送達，也不釋放本月預留。確定取消且沒有嘗試外發時釋放預留。保留預留是安全用量估算，不代表真的已發送或有新的付費扣款。
- 本次 worker 16 項成功，含 API 結果未知、503 通道驗證暫時失敗、內容凍結與額度預留先於外部呼叫。另五組通知／身分／SQL 守門38項成功。
- Changed-file ESLint 無錯誤；webhook 既有測試函式參數有11個 unused 警告，未改規則或關閉檢查。diff whitespace 通過。
